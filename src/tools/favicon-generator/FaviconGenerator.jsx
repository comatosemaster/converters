import { useEffect, useRef, useState } from 'react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

// --- Canvas helpers ----------------------------------------------------------

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Favicons must be square. If the source isn't, we "letterbox" it: draw it
// centered onto a square canvas sized to its longer side, padding the
// shorter side with either transparency or a solid color, instead of
// squashing/stretching the picture.
function buildSquareCanvas(img, backgroundHex) {
  const side = Math.max(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');

  if (backgroundHex) {
    ctx.fillStyle = backgroundHex;
    ctx.fillRect(0, 0, side, side);
  }
  // Leaving it unfilled keeps the padding transparent (canvases start
  // fully transparent) — that's the default, matching "keep alpha".

  const dx = (side - img.naturalWidth) / 2;
  const dy = (side - img.naturalHeight) / 2;
  ctx.drawImage(img, dx, dy);
  return canvas;
}

// The square base is already fully opaque-or-transparent edge to edge, so
// scaling it down/up to a new size is just a plain draw — no extra
// background fill needed here.
function resizeSquareCanvas(sourceCanvas, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0, size, size);
  return canvas;
}

// --- The .ico file packer -----------------------------------------------------
//
// Canvas can't export .ico directly, and there's no need for a library:
// the ICO format is just a small header, one "directory entry" per image
// describing its size/offset, and then the images themselves back to back.
// Modern ICOs are allowed to store each image as a plain PNG (instead of
// old-style raw bitmap data) — every current OS/browser understands that —
// so we can reuse the PNG blobs we already made for the other sizes.
async function buildIco(entries) {
  // entries: [{ size, blob }, ...] — one PNG blob per icon size to include.
  const images = await Promise.all(
    entries.map(async ({ size, blob }) => ({
      size,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    })),
  );

  const HEADER_SIZE = 6; // ICONDIR
  const ENTRY_SIZE = 16; // one ICONDIRENTRY per image
  let dataOffset = HEADER_SIZE + ENTRY_SIZE * images.length;

  const totalSize = dataOffset + images.reduce((sum, image) => sum + image.bytes.length, 0);
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // ICONDIR header: reserved (always 0), type (1 = icon), image count.
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  let entryPos = HEADER_SIZE;
  let dataPos = dataOffset;
  for (const image of images) {
    // A width/height byte of 0 means "256px" in the ICO format — not
    // relevant at our sizes, but included for correctness.
    output[entryPos] = image.size >= 256 ? 0 : image.size; // width
    output[entryPos + 1] = image.size >= 256 ? 0 : image.size; // height
    output[entryPos + 2] = 0; // color palette count (0 = true color)
    output[entryPos + 3] = 0; // reserved
    view.setUint16(entryPos + 4, 1, true); // color planes
    view.setUint16(entryPos + 6, 32, true); // bits per pixel (RGBA)
    view.setUint32(entryPos + 8, image.bytes.length, true); // byte size of this image
    view.setUint32(entryPos + 12, dataPos, true); // offset from file start

    output.set(image.bytes, dataPos);
    dataPos += image.bytes.length;
    entryPos += ENTRY_SIZE;
  }

  return new Blob([output], { type: 'image/x-icon' });
}

function buildManifestText() {
  const manifest = {
    name: 'My App',
    short_name: 'My App',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: '#ffffff',
    background_color: '#ffffff',
    display: 'standalone',
  };
  return JSON.stringify(manifest, null, 2);
}

function buildLinkTagsText() {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ].join('\n');
}

const ICO_SIZES = [16, 32, 48];
const PNG_SIZES = [16, 32, 48, 180, 192, 512];

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> — the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function FaviconGenerator() {
  const fileInputRef = useRef(null);
  // Holds the loaded <img> element between renders, so regenerating (e.g.
  // after toggling the background color) doesn't need to re-decode the file.
  const imageElRef = useRef(null);

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [dimensions, setDimensions] = useState(null); // natural { width, height }
  const [wasPadded, setWasPadded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [addBackground, setAddBackground] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [previewUrls, setPreviewUrls] = useState(null); // { 16: url, 32: url }
  const [linkTags, setLinkTags] = useState('');
  const [zipBlob, setZipBlob] = useState(null);
  const [zipUrl, setZipUrl] = useState('');
  const [copied, setCopied] = useState(false);
  // Remembers which exact package the user has downloaded, so we can tell
  // "already saved this" apart from "there's a newer package since then".
  const [downloadedBlob, setDownloadedBlob] = useState(null);

  // Turn the chosen File into an object URL we can point <img> at.
  useEffect(() => {
    if (!file) {
      setSourceUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The whole pipeline: load the image, square it off (padding if needed),
  // render every required size, pack the .ico, write the manifest, and zip
  // everything into one downloadable package. Re-runs whenever the source
  // image or background color setting changes.
  useEffect(() => {
    if (!sourceUrl) {
      imageElRef.current = null;
      setDimensions(null);
      setPreviewUrls((prev) => {
        if (prev) Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        return null;
      });
      setZipBlob(null);
      setZipUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }

    let cancelled = false;
    setIsGenerating(true);
    setError('');

    const img = new Image();
    img.onload = async () => {
      if (cancelled) return;
      imageElRef.current = img;
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setWasPadded(img.naturalWidth !== img.naturalHeight);

      try {
        const backgroundHex = addBackground ? backgroundColor : null;
        const baseCanvas = buildSquareCanvas(img, backgroundHex);

        // Render every size once, then export each to a PNG blob.
        const pngBlobs = {};
        for (const size of PNG_SIZES) {
          const canvas = resizeSquareCanvas(baseCanvas, size);
          pngBlobs[size] = await canvasToPngBlob(canvas);
        }
        if (cancelled) return;

        const icoBlob = await buildIco(ICO_SIZES.map((size) => ({ size, blob: pngBlobs[size] })));
        const manifestText = buildManifestText();
        const linkTagsText = buildLinkTagsText();

        // JSZip is only needed here, so it's imported dynamically rather
        // than bundled into every page's initial download.
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        zip.file('favicon.ico', icoBlob);
        zip.file('favicon-16x16.png', pngBlobs[16]);
        zip.file('favicon-32x32.png', pngBlobs[32]);
        zip.file('apple-touch-icon.png', pngBlobs[180]);
        zip.file('android-chrome-192x192.png', pngBlobs[192]);
        zip.file('android-chrome-512x512.png', pngBlobs[512]);
        zip.file('site.webmanifest', manifestText);
        const newZipBlob = await zip.generateAsync({ type: 'blob' });
        if (cancelled) return;

        setPreviewUrls((prev) => {
          if (prev) Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
          return { 16: URL.createObjectURL(pngBlobs[16]), 32: URL.createObjectURL(pngBlobs[32]) };
        });
        setLinkTags(linkTagsText);
        setZipBlob(newZipBlob);
        setZipUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(newZipBlob);
        });
      } catch {
        if (!cancelled) setError("Something went wrong generating the favicon package.");
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setError('Could not read that image file.');
        setIsGenerating(false);
      }
    };
    img.src = sourceUrl;

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, addBackground, backgroundColor]);

  function handleFile(selectedFile) {
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setFile(selectedFile);
  }

  function handleReset() {
    setFile(null);
    setError('');
  }

  // "Choose a different image" throws away the current package — if there's
  // unsaved work, confirm first instead of silently discarding it. (This
  // doesn't navigate anywhere, so UnsavedChangesGuard can't catch it on its
  // own — it only watches for page-to-page navigation.)
  function handleChooseAnotherClick() {
    if (hasUnsavedWork) {
      setShowResetConfirm(true);
    } else {
      handleReset();
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  async function handleCopyLinkTags() {
    await navigator.clipboard.writeText(linkTags);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isSmallSource = dimensions && Math.max(dimensions.width, dimensions.height) < 512;

  // "Unsaved work" means: a file is loaded, and either there's no package
  // yet or the current package isn't the one that's been downloaded.
  const hasUnsavedWork = Boolean(file) && (!zipBlob || zipBlob !== downloadedBlob);
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="favicon-generator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {!file ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <p className="drop-zone-title">Drag & drop a source image here, or click to browse</p>
          <p className="drop-zone-hint">A large square image (512px+) works best</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            onChange={(event) => handleFile(event.target.files[0])}
          />
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={handleChooseAnotherClick}>
              &larr; Choose a different image
            </button>
          </div>

          {showResetConfirm && (
            <ConfirmDialog
              title="Discard this favicon package?"
              message="You have an ungenerated or undownloaded package. Choosing a different image will discard it."
              confirmLabel="Discard and choose another"
              onCancel={() => setShowResetConfirm(false)}
              onConfirm={() => {
                setShowResetConfirm(false);
                handleReset();
              }}
            />
          )}

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={addBackground}
              onChange={(event) => setAddBackground(event.target.checked)}
            />
            Add a solid background color
          </label>

          {addBackground && (
            <div className="field">
              <label htmlFor="bg-color">Background color</label>
              <input
                id="bg-color"
                type="color"
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.target.value)}
              />
            </div>
          )}

          {!addBackground && (
            <p className="field-hint">
              No background selected — transparent areas of your image will stay transparent.
            </p>
          )}

          {wasPadded && (
            <p className="field-hint">
              Your image wasn't square, so it was padded to a square with{' '}
              {addBackground ? 'the background color' : 'transparency'} rather than being
              stretched.
            </p>
          )}
          {isSmallSource && (
            <p className="field-hint">
              Your source image is smaller than the recommended 512×512 — the larger sizes may
              look soft since shrinking down can't invent missing detail, and this can't add any
              back.
            </p>
          )}

          {error && <p className="field-error">{error}</p>}

          <div className="favicon-preview-row">
            <div className="favicon-preview">
              <div className="favicon-preview-swatch favicon-preview-16">
                {previewUrls && <img src={previewUrls[16]} alt="16 by 16 pixel preview" />}
              </div>
              <span className="field-hint">16&times;16</span>
            </div>
            <div className="favicon-preview">
              <div className="favicon-preview-swatch favicon-preview-32">
                {previewUrls && <img src={previewUrls[32]} alt="32 by 32 pixel preview" />}
              </div>
              <span className="field-hint">32&times;32</span>
            </div>
          </div>

          {isGenerating && <p className="category-empty">Generating your favicon package…</p>}

          {linkTags && (
            <div className="field">
              <div className="field-header">
                <label htmlFor="link-tags">Paste this into your site's &lt;head&gt;</label>
                <button type="button" className="copy-button" onClick={handleCopyLinkTags}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <textarea id="link-tags" rows={5} value={linkTags} readOnly />
            </div>
          )}

          {zipBlob && zipUrl && (
            <a
              className="download-button"
              href={zipUrl}
              download="favicon-package.zip"
              onClick={() => setDownloadedBlob(zipBlob)}
            >
              Download favicon package ({formatBytes(zipBlob.size)})
            </a>
          )}
        </>
      )}
    </div>
  );
}
