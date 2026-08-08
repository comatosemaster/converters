import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';

// --- Format options ---------------------------------------------------------
//
// `lossy: true` means the format has a quality slider (it can trade file
// size for image quality). PNG is lossless, so it never loses quality no
// matter what - there's nothing to slide.

const FORMATS = [
  { mime: 'image/png', label: 'PNG', extension: 'png', lossy: false },
  { mime: 'image/jpeg', label: 'JPG', extension: 'jpg', lossy: true },
  { mime: 'image/webp', label: 'WebP', extension: 'webp', lossy: true },
  { mime: 'image/avif', label: 'AVIF', extension: 'avif', lossy: true },
];

const FORMAT_BY_MIME = Object.fromEntries(FORMATS.map((f) => [f.mime, f]));

// Compares two file sizes and returns a friendly "37% smaller" style label.
function sizeChangeLabel(originalBytes, newBytes) {
  const percent = Math.round(((originalBytes - newBytes) / originalBytes) * 100);
  if (percent > 0) return { text: `${percent}% smaller`, direction: 'smaller' };
  if (percent < 0) return { text: `${Math.abs(percent)}% larger`, direction: 'larger' };
  return { text: 'same size', direction: 'same' };
}

function buildDownloadName(originalName, mime) {
  const base = originalName.replace(/\.[^./]+$/, ''); // strip the original extension
  const extension = FORMAT_BY_MIME[mime]?.extension ?? 'bin';
  return `${base}.${extension}`;
}

// --- The tool component -----------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ImageConverter() {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null); // the original File the user picked
  const [sourceUrl, setSourceUrl] = useState(''); // object URL for the original preview
  const [dimensions, setDimensions] = useState(null); // { width, height } of the original
  const [isDragging, setIsDragging] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // A pasted image, held here while we wait for the discard confirmation
  // above - null means "just resetting", not "resetting to load a file".
  const [pendingFile, setPendingFile] = useState(null);

  const [format, setFormat] = useState('image/webp');
  const [quality, setQuality] = useState(0.85);

  const [outputBlob, setOutputBlob] = useState(null);
  const [outputUrl, setOutputUrl] = useState(''); // object URL for the converted preview
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState('');
  // Remembers which exact result the user has downloaded, so we can tell
  // "already saved this" apart from "there's a newer result since then".
  const [downloadedBlob, setDownloadedBlob] = useState(null);

  // Turn the chosen File into an object URL we can point <img> at. Runs
  // again whenever a new file is picked, and cleans up the old URL so we
  // don't leak memory.
  useEffect(() => {
    if (!file) {
      setSourceUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The actual conversion: draw the source image onto an off-screen canvas,
  // then ask the canvas to export itself as the chosen format. Re-runs
  // whenever the source image, target format, or quality changes.
  useEffect(() => {
    if (!sourceUrl) {
      setOutputUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setOutputBlob(null);
      setDimensions(null);
      return;
    }

    let cancelled = false;
    setIsConverting(true);
    setError('');

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (format === 'image/jpeg') {
        // JPEG has no transparency channel - without this, transparent
        // areas would turn black instead of staying white/blank.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (cancelled) return;
          if (!blob) {
            setError(`Your browser couldn't create a ${FORMAT_BY_MIME[format].label} file.`);
            setIsConverting(false);
            return;
          }
          // Browsers that don't support the requested format silently fall
          // back to PNG - let the user know instead of pretending it worked.
          if (blob.type !== format) {
            setError(
              `Your browser doesn't support exporting ${FORMAT_BY_MIME[format].label} - showing PNG instead.`,
            );
          }
          setOutputBlob(blob);
          setOutputUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          setIsConverting(false);
        },
        format,
        format === 'image/png' ? undefined : quality,
      );
    };
    img.onerror = () => {
      if (!cancelled) {
        setError('Could not read that image file.');
        setIsConverting(false);
      }
    };
    img.src = sourceUrl;

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, format, quality]);

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

  // "Choose a different image" and pasting a new image both throw away the
  // current file/result - if there's unsaved work, confirm first instead of
  // silently discarding it. (Neither of these navigates anywhere, so
  // UnsavedChangesGuard can't catch them on its own - it only watches for
  // page-to-page navigation.) `pendingFile` remembers a pasted image while
  // we wait for the user to confirm, so we can load it after they do.
  function handleChooseAnotherClick() {
    if (hasUnsavedWork) {
      setPendingFile(null);
      setShowResetConfirm(true);
    } else {
      handleReset();
    }
  }

  function handlePastedFile(newFile) {
    if (hasUnsavedWork) {
      setPendingFile(newFile);
      setShowResetConfirm(true);
    } else {
      handleFile(newFile);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  const selectedFormat = FORMAT_BY_MIME[format];
  const sizeChange =
    outputBlob && file ? sizeChangeLabel(file.size, outputBlob.size) : null;

  // "Unsaved work" means: a file is loaded, and either there's no result
  // yet or the current result isn't the one that's been downloaded.
  const hasUnsavedWork = Boolean(file) && (!outputBlob || outputBlob !== downloadedBlob);
  useUnsavedChangesWarning(hasUnsavedWork);
  // Always listening (not just while the drop zone is empty) - pasting a
  // new image over an existing one is allowed, it just goes through the
  // same discard confirmation as "Choose a different image" when needed.
  usePasteToUpload(true, handlePastedFile);

  return (
    <div className="image-converter">
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
          <p className="drop-zone-title">Drag &amp; drop, paste, or click to browse</p>
          <p className="drop-zone-hint">Converts to PNG, JPG, WebP, or AVIF</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
              title="Discard this image?"
              message={
                pendingFile
                  ? 'You have unsaved work on this image. Pasting a new one will discard it.'
                  : 'You have unsaved work on this image. Choosing a different one will discard it.'
              }
              confirmLabel={pendingFile ? 'Discard and load pasted image' : 'Discard and choose another'}
              onCancel={() => {
                setShowResetConfirm(false);
                setPendingFile(null);
              }}
              onConfirm={() => {
                setShowResetConfirm(false);
                if (pendingFile) {
                  handleFile(pendingFile);
                  setPendingFile(null);
                } else {
                  handleReset();
                }
              }}
            />
          )}

          <div className="mode-toggle" role="radiogroup" aria-label="Output format">
            {FORMATS.map((f) => (
              <button
                key={f.mime}
                type="button"
                className={format === f.mime ? 'mode-button active' : 'mode-button'}
                aria-pressed={format === f.mime}
                onClick={() => setFormat(f.mime)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {selectedFormat.lossy && (
            <div className="field">
              <label htmlFor="quality">Quality: {Math.round(quality * 100)}%</label>
              <input
                id="quality"
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
              />
            </div>
          )}

          {error && <p className="field-error">{error}</p>}

          <div className="comparison">
            <div className="comparison-panel">
              <h3>Original</h3>
              <div className="comparison-image-frame">
                {sourceUrl && <img src={sourceUrl} alt="" className="comparison-image" />}
              </div>
              <dl className="comparison-meta">
                <div>
                  <dt>Format</dt>
                  <dd>{file.type || 'unknown'}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatBytes(file.size)}</dd>
                </div>
                {dimensions && (
                  <div>
                    <dt>Dimensions</dt>
                    <dd>
                      {dimensions.width}&times;{dimensions.height}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="comparison-panel">
              <h3>
                Converted
                {isConverting && <span className="converting-badge">Converting…</span>}
              </h3>
              {outputUrl && outputBlob ? (
                <>
                  <div className="comparison-image-frame">
                    <img src={outputUrl} alt="" className="comparison-image" />
                  </div>
                  <dl className="comparison-meta">
                    <div>
                      <dt>Format</dt>
                      <dd>{outputBlob.type}</dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>
                        {formatBytes(outputBlob.size)}
                        {sizeChange && sizeChange.direction !== 'same' && (
                          <>
                            {' '}
                            <span className={`size-badge ${sizeChange.direction}`}>
                              ({sizeChange.text})
                            </span>
                          </>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <a
                    className="download-button"
                    href={outputUrl}
                    download={buildDownloadName(file.name, outputBlob.type)}
                    onClick={() => setDownloadedBlob(outputBlob)}
                  >
                    Download {FORMAT_BY_MIME[outputBlob.type]?.label ?? outputBlob.type}
                  </a>
                </>
              ) : (
                <p className="category-empty">{isConverting ? 'Working on it…' : 'Waiting…'}</p>
              )}
            </div>
          </div>
        </>
      )}

      <article className="tool-article">
        <p>
          PNG, JPG, WebP, and AVIF each make different tradeoffs between quality, file size, and
          browser support. This tool re-encodes any image into whichever of those formats you
          need, entirely in your browser using the Canvas API - nothing is uploaded to convert it.
        </p>

        <h2>How it works</h2>
        <p>
          Your image is drawn onto an off-screen canvas, then the canvas exports itself as the
          format you picked via <code>canvas.toBlob()</code>. For lossy formats (JPG, WebP, AVIF)
          the quality slider controls how much detail that export keeps versus how small the
          result is; PNG is lossless, so it ignores quality entirely.
        </p>

        <h2>PNG vs JPG vs WebP vs AVIF</h2>
        <ul>
          <li>
            <strong>PNG</strong> is lossless and supports transparency - best for graphics, logos,
            and screenshots with sharp edges or text, but larger for photos.
          </li>
          <li>
            <strong>JPG</strong> is lossy with no transparency - a long-standing, universally
            supported default for photos.
          </li>
          <li>
            <strong>WebP</strong> supports both lossy and lossless compression plus transparency,
            usually beating JPG and PNG at the same visual quality - supported by all modern
            browsers.
          </li>
          <li>
            <strong>AVIF</strong> compresses even further than WebP at equivalent quality, but
            encoding/decoding support is newer and less universal - check the browser
            compatibility note below.
          </li>
        </ul>

        <h2>When to use each format</h2>
        <ul>
          <li>Use <strong>PNG</strong> for logos, icons, and anything needing crisp transparency.</li>
          <li>Use <strong>JPG</strong> for maximum compatibility with photos, including older tools/software.</li>
          <li>Use <strong>WebP</strong> as a modern general-purpose default for web images.</li>
          <li>Use <strong>AVIF</strong> when you want the smallest possible file and can confirm your audience's browsers support it.</li>
        </ul>

        <h2>Common mistakes</h2>
        <ul>
          <li>Converting a JPG to PNG expecting it to look sharper - JPG's lossy compression already discarded detail that PNG can't bring back.</li>
          <li>Converting a transparent PNG to JPG and being surprised the transparent areas turned white - JPG has no alpha channel.</li>
          <li>Re-compressing an already-compressed JPG repeatedly, which compounds quality loss each time.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Will converting PNG to JPG reduce quality?</h3>
          <p>Yes, if you use a JPG quality below 100% - JPG is lossy, so some detail is discarded. PNG itself is always lossless.</p>
        </div>
        <div className="faq-item">
          <h3>Why doesn't AVIF work in my browser?</h3>
          <p>
            AVIF support varies - if your browser can't produce it, this tool falls back to PNG
            automatically and tells you so, rather than failing silently.
          </p>
        </div>
        <div className="faq-item">
          <h3>Does converting formats reduce file size?</h3>
          <p>
            Often, but it depends on the image and settings - for size specifically, try the{' '}
            <Link to="/tool/image-compressor">Image Compressor</Link>, which is built for that.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I convert multiple images at once?</h3>
          <p>Not in this tool - it's built for one image at a time. See <Link to="/tool/heic-to-jpg">HEIC to JPG</Link> for an example of a batch-capable tool.</p>
        </div>
        <div className="faq-item">
          <h3>Is my image uploaded anywhere?</h3>
          <p>No - the conversion runs entirely in your browser using the Canvas API.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/graphics-media">Graphics &amp; Media tools</Link> on
          Rootconverter.
        </p>
      </article>
    </div>
  );
}
