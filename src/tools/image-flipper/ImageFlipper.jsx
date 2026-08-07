import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import {
  DEFAULT_FORMAT,
  FORMATS,
  buildDownloadName,
  flipImage,
  validateImageDimensions,
  validateImageFile,
} from './imageFlipUtils.js';

const FORMAT_LABEL = Object.fromEntries(FORMATS.map((f) => [f.mime, f.label]));

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ImageFlipper() {
  const fileInputRef = useRef(null);
  // The loaded <img> element, kept between renders so we can redraw it onto
  // a canvas without re-decoding the file every time a flip setting changes.
  const imageElRef = useRef(null);

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [dimensions, setDimensions] = useState(null); // natural { width, height }
  const [hasTransparency, setHasTransparency] = useState(false);
  const [isDragging, setIsDragging] = useState(false); // dropzone drag-over state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // A pasted image, held here while we wait for the discard confirmation
  // above - null means "just resetting", not "resetting to load a file".
  const [pendingFile, setPendingFile] = useState(null);

  useDocumentMeta({
    title: 'Image Flipper - Flip Images Horizontally or Vertically | Rootconverter',
    description:
      'Flip images horizontally or vertically entirely in your browser using the Canvas API. Transparency preserved, no upload required.',
  });

  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [format, setFormat] = useState(DEFAULT_FORMAT);

  const [outputBlob, setOutputBlob] = useState(null);
  const [outputUrl, setOutputUrl] = useState('');
  const [isFlipping, setIsFlipping] = useState(false);
  const [error, setError] = useState('');

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

  // Loads the image once per file: records its natural size, validates its
  // pixel dimensions aren't unreasonably huge, and checks whether it has
  // any transparent pixels (for the JPEG warning).
  useEffect(() => {
    if (!sourceUrl) {
      imageElRef.current = null;
      setDimensions(null);
      setHasTransparency(false);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;

      const dimensionCheck = validateImageDimensions(img.naturalWidth, img.naturalHeight);
      if (!dimensionCheck.ok) {
        setError(dimensionCheck.error);
        return;
      }

      imageElRef.current = img;
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setFlipHorizontal(false);
      setFlipVertical(false);

      const probeCanvas = document.createElement('canvas');
      probeCanvas.width = img.naturalWidth;
      probeCanvas.height = img.naturalHeight;
      const probeCtx = probeCanvas.getContext('2d');
      probeCtx.drawImage(img, 0, 0);
      const { data } = probeCtx.getImageData(0, 0, probeCanvas.width, probeCanvas.height);
      let transparent = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          transparent = true;
          break;
        }
      }
      setHasTransparency(transparent);
    };
    img.onerror = () => {
      if (!cancelled) setError('Could not read that image file.');
    };
    img.src = sourceUrl;

    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  // Redraws the flipped preview whenever the source image, flip settings,
  // or output format change. Runs instantly (no explicit "apply" button) -
  // a flip is cheap enough that there's no reason to make the user ask
  // for it.
  useEffect(() => {
    if (!sourceUrl || !dimensions || !imageElRef.current) return;

    const img = imageElRef.current;
    let cancelled = false;
    setIsFlipping(true);
    setError('');

    flipImage(img, { flipHorizontal, flipVertical }, format)
      .then((blob) => {
        if (cancelled) return;
        setOutputBlob(blob);
        setOutputUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setIsFlipping(false);
      })
      .catch((flipError) => {
        if (cancelled) return;
        setError(flipError.message);
        setIsFlipping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, dimensions, flipHorizontal, flipVertical, format]);

  function handleFile(selectedFile) {
    if (!selectedFile) return;
    const validation = validateImageFile(selectedFile);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setFile(selectedFile);
  }

  function clearOutput() {
    setOutputBlob(null);
    setOutputUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setError('');
  }

  // Both "Reset" and "Replace Image" discard the current image and any
  // flip settings, returning to the empty drop zone - matching the
  // "Clear the modified state after Reset" requirement, since keeping the
  // image loaded but only reverting flip settings would leave "an image
  // is loaded" (itself a modified-state trigger) still true.
  function handleReset() {
    setFile(null);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setFormat(DEFAULT_FORMAT);
    clearOutput();
  }

  // Resetting/replacing throws away the current file/result - if there's
  // unsaved work, confirm first instead of silently discarding it. Neither
  // of these navigates anywhere, so UnsavedChangesGuard can't catch them
  // on its own - it only watches for page-to-page navigation. `pendingFile`
  // remembers a pasted image while we wait for the user to confirm, so we
  // can load it after they do.
  function handleResetClick() {
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

  const showTransparencyWarning = format === 'image/jpeg' && hasTransparency;

  // "Unsaved work" means: a file is loaded (per spec, loading alone counts
  // as a modification worth protecting), or the flip settings have moved
  // away from their just-loaded defaults.
  const hasUnsavedWork = Boolean(file);
  useUnsavedChangesWarning(hasUnsavedWork);
  // Always listening (not just while the drop zone is empty) - pasting a
  // new image over an existing one is allowed, it just goes through the
  // same discard confirmation as "Replace Image" when needed.
  usePasteToUpload(true, handlePastedFile);

  return (
    <div className="image-flipper">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {!file ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, paste, or click to choose an image to flip"
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
          <p className="drop-zone-hint">Flip it horizontally or vertically, then download the result</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            aria-label="Choose an image file"
            onChange={(event) => handleFile(event.target.files[0])}
          />
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={handleResetClick}>
              &larr; Replace Image
            </button>
          </div>

          {showResetConfirm && (
            <ConfirmDialog
              title="Discard this image?"
              message={
                pendingFile
                  ? 'You have unsaved work on this image. Pasting a new one will discard it.'
                  : 'You have unsaved work on this image. Replacing it will discard your flip settings.'
              }
              confirmLabel={pendingFile ? 'Discard and load pasted image' : 'Discard and replace'}
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

          {!dimensions ? (
            error ? (
              <p className="field-error">{error}</p>
            ) : (
              <p className="category-empty">Loading image…</p>
            )
          ) : (
            <>
              <fieldset className="field password-options-fieldset">
                <legend>Flip direction</legend>
                <label className="checkbox-field">
                  <input
                    id="flip-horizontal"
                    type="checkbox"
                    checked={flipHorizontal}
                    onChange={(event) => setFlipHorizontal(event.target.checked)}
                  />
                  Flip horizontal (mirror left/right)
                </label>
                <label className="checkbox-field">
                  <input
                    id="flip-vertical"
                    type="checkbox"
                    checked={flipVertical}
                    onChange={(event) => setFlipVertical(event.target.checked)}
                  />
                  Flip vertical (mirror top/bottom)
                </label>
              </fieldset>

              <div className="field">
                <label htmlFor="flip-format">Output format</label>
                <select
                  id="flip-format"
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                >
                  {FORMATS.map((f) => (
                    <option key={f.mime} value={f.mime}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {showTransparencyWarning && (
                <p className="field-error">
                  This image has transparency, which JPEG doesn't support - transparent areas
                  will turn white. Choose PNG or WebP to keep transparency.
                </p>
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
                    <div>
                      <dt>Dimensions</dt>
                      <dd>
                        {dimensions.width}&times;{dimensions.height}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="comparison-panel">
                  <h3>
                    Flipped
                    {isFlipping && <span className="converting-badge">Working…</span>}
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
                          <dt>Estimated size</dt>
                          <dd>{formatBytes(outputBlob.size)}</dd>
                        </div>
                        <div>
                          <dt>Dimensions</dt>
                          <dd>
                            {dimensions.width}&times;{dimensions.height}
                          </dd>
                        </div>
                      </dl>
                      <a
                        className="download-button"
                        href={outputUrl}
                        download={buildDownloadName(file.name, outputBlob.type)}
                      >
                        Download {FORMAT_LABEL[outputBlob.type] ?? ''}
                      </a>
                    </>
                  ) : (
                    <p className="category-empty">{isFlipping ? 'Working on it…' : 'Waiting…'}</p>
                  )}
                </div>
              </div>

              <div className="converter-toolbar">
                <button type="button" className="ghost-button" onClick={handleResetClick}>
                  Reset
                </button>
              </div>
            </>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          Flipping mirrors an image along an axis - horizontally swaps left and right, vertically
          swaps top and bottom. This tool does both entirely in your browser using the Canvas
          API's transform functions, so nothing you upload ever leaves your device.
        </p>

        <h2>Horizontal vs vertical flipping</h2>
        <ul>
          <li>
            <strong>Horizontal flip</strong> mirrors the image left-to-right, like looking at it
            in a mirror. Useful for correcting a selfie's mirrored orientation, or for design
            work where a subject needs to face the other direction.
          </li>
          <li>
            <strong>Vertical flip</strong> mirrors the image top-to-bottom, turning it upside
            down. Both can be applied together, which is equivalent to rotating the image 180
            degrees.
          </li>
        </ul>

        <h2>How it works</h2>
        <p>
          The Canvas API can scale its drawing context by <code>-1</code> on either axis before
          drawing - combined with shifting the origin to the opposite edge first, that mirrors
          the image instead of drawing it off-screen. Transparent pixels are preserved throughout
          for PNG and WebP output, since the canvas keeps the original alpha channel intact
          unless you export as JPEG (which has no transparency support).
        </p>

        <h2>Supported formats</h2>
        <p>
          Upload PNG, JPG/JPEG, or WebP images, and download the flipped result as PNG, JPG, or
          WebP - the input and output formats don't have to match.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is flipping the same as rotating?</h3>
          <p>No - flipping mirrors an image (like a reflection), while rotating turns it around a point. Flipping both horizontally and vertically happens to produce the same result as a 180-degree rotation, but a 90-degree rotation isn't achievable with flipping alone.</p>
        </div>
        <div className="faq-item">
          <h3>Will flipping reduce my image quality?</h3>
          <p>No - flipping just repositions existing pixels, it doesn't resample or compress them (beyond whatever compression the chosen output format normally applies).</p>
        </div>
        <div className="faq-item">
          <h3>Why did my transparent image turn white?</h3>
          <p>You likely selected JPEG as the output format - JPEG has no transparency channel. Choose PNG or WebP to keep transparency.</p>
        </div>
        <div className="faq-item">
          <h3>Can I flip an image both ways at once?</h3>
          <p>Yes - checking both "Flip horizontal" and "Flip vertical" applies both, which is the same result as rotating the image 180 degrees.</p>
        </div>
        <div className="faq-item">
          <h3>Is my image uploaded anywhere?</h3>
          <p>No - flipping happens entirely in your browser using the Canvas API. The image never leaves your device.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Also try the <Link to="/tool/image-resizer">Image Resizer &amp; Cropper</Link>, the{' '}
          <Link to="/tool/image-converter">Image Converter</Link>, or browse the rest of the{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
