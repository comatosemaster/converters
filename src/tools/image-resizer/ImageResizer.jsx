import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';

// --- Helpers -----------------------------------------------------------------

// Maps an actual output mime type (what the browser really produced) to a
// file extension for the download name — keyed by the real blob type,
// since unsupported formats silently fall back to PNG.
const EXTENSION_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function buildDownloadName(originalName, mime) {
  const base = originalName.replace(/\.[^./]+$/, ''); // strip the original extension
  const extension = EXTENSION_BY_MIME[mime] ?? 'bin';
  return `${base}-resized.${extension}`;
}

// The crop box is stored as FRACTIONS of the image (0 to 1 on each axis),
// not pixels. That's what lets the same box work whether the preview is
// shown at 300px or 800px wide — we only convert to real pixels right
// before drawing the final crop.

const ASPECT_PRESETS = { free: null, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };

// Keeps a crop box's fractions between 0 and 1 and inside the image, with
// a small minimum size so it can never collapse to nothing.
function clampBox({ x, y, width, height }) {
  const minSize = 0.02;
  const w = Math.min(1, Math.max(minSize, width));
  const h = Math.min(1, Math.max(minSize, height));
  const nx = Math.min(Math.max(0, x), 1 - w);
  const ny = Math.min(Math.max(0, y), 1 - h);
  return { x: nx, y: ny, width: w, height: h };
}

// Recomputes a box's width/height (in fractions) so it matches a real
// pixel aspect ratio like 4/3. `imageAspect` (naturalWidth / naturalHeight)
// is needed because a fraction-based square isn't a pixel-based square
// unless the source image itself happens to be square.
// Picking an aspect preset starts over from the FULL image — the largest
// centered box of that ratio that still fits — rather than reshaping
// whatever partial selection was already there.
function maxBoxForAspect(aspectRatio, imageAspect) {
  if (!aspectRatio) return { x: 0, y: 0, width: 1, height: 1 }; // "Free" — select everything

  // Whichever axis (width or height) is the tighter fit stays at 100%;
  // the other shrinks to match the target ratio.
  const widthFraction = aspectRatio >= imageAspect ? 1 : aspectRatio / imageAspect;
  const heightFraction = aspectRatio >= imageAspect ? imageAspect / aspectRatio : 1;

  return clampBox({
    x: (1 - widthFraction) / 2,
    y: (1 - heightFraction) / 2,
    width: widthFraction,
    height: heightFraction,
  });
}

// Given which corner handle is being dragged, works out the box's new
// fractions from how far the pointer has moved (also in fractions).
// When an aspect ratio is locked, the "far" edge stays put and the near
// edge's height is recalculated to match — like resizing a window from a
// corner while holding its opposite corner in place.
function resizeBoxFromHandle(handle, startBox, dxFraction, dyFraction, aspectRatio, imageAspect) {
  let { x, y, width, height } = startBox;

  if (handle.includes('e')) width = startBox.width + dxFraction;
  if (handle.includes('w')) {
    x = startBox.x + dxFraction;
    width = startBox.width - dxFraction;
  }
  if (handle.includes('s')) height = startBox.height + dyFraction;
  if (handle.includes('n')) {
    y = startBox.y + dyFraction;
    height = startBox.height - dyFraction;
  }

  if (aspectRatio) {
    const newHeight = (width * imageAspect) / aspectRatio;
    if (handle.includes('n')) y = startBox.y + startBox.height - newHeight;
    height = newHeight;
  }

  return clampBox({ x, y, width, height });
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> — the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ImageResizer() {
  const fileInputRef = useRef(null);
  // The loaded <img> element, kept between renders so we can redraw it onto
  // a canvas without re-decoding the file every time a setting changes.
  const imageElRef = useRef(null);
  // The box that wraps the crop preview image — its on-screen size is what
  // pointer-drag distances get divided by to turn them into fractions.
  const cropWrapperRef = useRef(null);

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [dimensions, setDimensions] = useState(null); // natural { width, height }
  const [hasTransparency, setHasTransparency] = useState(false);
  const [isDragging, setIsDragging] = useState(false); // dropzone drag-over state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // A pasted image, held here while we wait for the discard confirmation
  // above — null means "just resetting", not "resetting to load a file".
  const [pendingFile, setPendingFile] = useState(null);

  useDocumentMeta({
    title: 'Image Resizer & Cropper — Free & Client-Side | Toolbox',
    description:
      'Resize or crop images to exact dimensions entirely in your browser. Lock aspect ratio, use scale presets, or drag a crop selection — no upload required.',
  });

  const [mode, setMode] = useState('resize'); // 'resize' | 'crop'
  const [format, setFormat] = useState('image/png');

  // Resize mode
  const [resizeWidth, setResizeWidth] = useState('');
  const [resizeHeight, setResizeHeight] = useState('');
  const [lockAspectRatio, setLockAspectRatio] = useState(true);

  // Crop mode
  const [cropBox, setCropBox] = useState({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
  const [aspectPreset, setAspectPreset] = useState('free');

  const [outputBlob, setOutputBlob] = useState(null);
  const [outputUrl, setOutputUrl] = useState('');
  const [outputDimensions, setOutputDimensions] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState('');
  // Remembers which exact result the user has downloaded, so we can tell
  // "already saved this" apart from "there's a newer result since then".
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

  // Loads the image once per file: records its natural size, checks
  // whether it has any transparent pixels (for the JPEG warning), and
  // resets the resize/crop controls to sensible starting points.
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
      imageElRef.current = img;
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setResizeWidth(img.naturalWidth);
      setResizeHeight(img.naturalHeight);
      setCropBox({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
      setAspectPreset('free');

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

  // Resize mode updates live: whenever width/height/format change, redraw
  // the whole source image onto a canvas sized to the new dimensions. The
  // 9-argument drawImage below maps the ENTIRE source image onto a
  // differently-sized destination rectangle — that's what does the resize.
  useEffect(() => {
    if (mode !== 'resize') return;
    if (!sourceUrl || !dimensions || !imageElRef.current) return;
    if (!resizeWidth || !resizeHeight) return; // fields empty/invalid — nothing to draw yet

    const img = imageElRef.current;
    let cancelled = false;
    setIsConverting(true);
    setError('');

    const targetWidth = Math.max(1, Math.round(resizeWidth));
    const targetHeight = Math.max(1, Math.round(resizeHeight));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (format === 'image/jpeg') {
      // JPEG has no transparency channel — fill white first so transparent
      // areas don't turn black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.drawImage(
      img,
      0, 0, img.naturalWidth, img.naturalHeight, // source rectangle: the whole image
      0, 0, targetWidth, targetHeight, // destination rectangle: the new size
    );

    canvas.toBlob(
      (blob) => {
        if (cancelled) return;
        if (!blob) {
          setError("Your browser couldn't create this image.");
          setIsConverting(false);
          return;
        }
        if (blob.type !== format) {
          setError("Your browser couldn't keep this format — exported as PNG instead.");
        }
        setOutputBlob(blob);
        setOutputDimensions({ width: targetWidth, height: targetHeight });
        setOutputUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setIsConverting(false);
      },
      format,
      format === 'image/png' ? undefined : 0.92,
    );

    return () => {
      cancelled = true;
    };
  }, [mode, sourceUrl, dimensions, resizeWidth, resizeHeight, format]);

  function handleFile(selectedFile) {
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setFile(selectedFile);
  }

  function clearOutput() {
    setOutputBlob(null);
    setOutputDimensions(null);
    setOutputUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setError('');
  }

  function handleReset() {
    setFile(null);
    clearOutput();
  }

  // "Choose a different image" and pasting a new image both throw away the
  // current file/result — if there's unsaved work, confirm first instead of
  // silently discarding it. (Neither of these navigates anywhere, so
  // UnsavedChangesGuard can't catch them on its own — it only watches for
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

  function handleWidthChange(value) {
    const newWidth = value === '' ? '' : Number(value);
    setResizeWidth(newWidth);
    if (lockAspectRatio && newWidth && dimensions) {
      setResizeHeight(Math.round(newWidth / (dimensions.width / dimensions.height)));
    }
  }

  function handleHeightChange(value) {
    const newHeight = value === '' ? '' : Number(value);
    setResizeHeight(newHeight);
    if (lockAspectRatio && newHeight && dimensions) {
      setResizeWidth(Math.round(newHeight * (dimensions.width / dimensions.height)));
    }
  }

  function applyScale(percent) {
    if (!dimensions) return;
    setResizeWidth(Math.max(1, Math.round(dimensions.width * percent)));
    setResizeHeight(Math.max(1, Math.round(dimensions.height * percent)));
  }

  // --- Crop box dragging -----------------------------------------------------
  // Both handlers follow the same shape: on pointerdown, remember where the
  // pointer started and what the box looked like then, and attach
  // window-level listeners that keep updating the box until pointerup.
  // Using the window (not just the element) means dragging still works
  // even if the pointer briefly moves outside the box while moving fast.

  function startMove(event) {
    event.preventDefault();
    const startPointerX = event.clientX;
    const startPointerY = event.clientY;
    const startBox = cropBox;
    const rect = cropWrapperRef.current.getBoundingClientRect();

    function onMove(moveEvent) {
      const dx = (moveEvent.clientX - startPointerX) / rect.width;
      const dy = (moveEvent.clientY - startPointerY) / rect.height;
      setCropBox(clampBox({ ...startBox, x: startBox.x + dx, y: startBox.y + dy }));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startResize(event, handle) {
    event.preventDefault();
    event.stopPropagation();
    const startPointerX = event.clientX;
    const startPointerY = event.clientY;
    const startBox = cropBox;
    const rect = cropWrapperRef.current.getBoundingClientRect();
    const targetAspect = ASPECT_PRESETS[aspectPreset];
    const imageAspect = dimensions.width / dimensions.height;

    function onMove(moveEvent) {
      const dx = (moveEvent.clientX - startPointerX) / rect.width;
      const dy = (moveEvent.clientY - startPointerY) / rect.height;
      setCropBox(resizeBoxFromHandle(handle, startBox, dx, dy, targetAspect, imageAspect));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleApplyCrop() {
    if (!dimensions || !imageElRef.current) return;
    const img = imageElRef.current;

    // Convert the crop box from fractions back into real source pixels.
    const sx = Math.round(cropBox.x * dimensions.width);
    const sy = Math.round(cropBox.y * dimensions.height);
    const sWidth = Math.round(cropBox.width * dimensions.width);
    const sHeight = Math.round(cropBox.height * dimensions.height);

    setIsConverting(true);
    setError('');

    const canvas = document.createElement('canvas');
    canvas.width = sWidth;
    canvas.height = sHeight;
    const ctx = canvas.getContext('2d');

    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sWidth, sHeight);
    }

    // The 9-argument drawImage here pulls just the selected rectangle
    // (sx/sy/sWidth/sHeight) out of the source and draws it filling the
    // whole destination canvas — that's what does the cropping.
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Your browser couldn't create this image.");
          setIsConverting(false);
          return;
        }
        if (blob.type !== format) {
          setError("Your browser couldn't keep this format — exported as PNG instead.");
        }
        setOutputBlob(blob);
        setOutputDimensions({ width: sWidth, height: sHeight });
        setOutputUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setIsConverting(false);
      },
      format,
      format === 'image/png' ? undefined : 0.92,
    );
  }

  const showTransparencyWarning = format === 'image/jpeg' && hasTransparency;
  const imageAspect = dimensions ? dimensions.width / dimensions.height : 1;

  // "Unsaved work" means: a file is loaded, and either there's no result
  // yet or the current result isn't the one that's been downloaded. This
  // covers both modes the same way, since they share the same output state.
  const hasUnsavedWork = Boolean(file) && (!outputBlob || outputBlob !== downloadedBlob);
  useUnsavedChangesWarning(hasUnsavedWork);
  // Always listening (not just while the drop zone is empty) — pasting a
  // new image over an existing one is allowed, it just goes through the
  // same discard confirmation as "Choose a different image" when needed.
  usePasteToUpload(true, handlePastedFile);

  return (
    <div className="image-resizer">
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
          <p className="drop-zone-hint">Resize or crop it, then download the result</p>
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

          {!dimensions ? (
            <p className="category-empty">Loading image…</p>
          ) : (
            <>
              <div className="mode-toggle" role="radiogroup" aria-label="Tool mode">
                <button
                  type="button"
                  className={mode === 'resize' ? 'mode-button active' : 'mode-button'}
                  aria-pressed={mode === 'resize'}
                  onClick={() => {
                    setMode('resize');
                    clearOutput();
                  }}
                >
                  Resize
                </button>
                <button
                  type="button"
                  className={mode === 'crop' ? 'mode-button active' : 'mode-button'}
                  aria-pressed={mode === 'crop'}
                  onClick={() => {
                    setMode('crop');
                    clearOutput();
                  }}
                >
                  Crop
                </button>
              </div>

              <div className="field">
                <label htmlFor="format">Output format</label>
                <select id="format" value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/webp">WebP</option>
                </select>
              </div>

              {showTransparencyWarning && (
                <p className="field-error">
                  This image has transparency, which JPEG doesn't support — transparent areas
                  will turn white. Consider PNG or WebP instead.
                </p>
              )}

              {mode === 'resize' ? (
                <>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={lockAspectRatio}
                      onChange={(event) => setLockAspectRatio(event.target.checked)}
                    />
                    Lock aspect ratio
                  </label>

                  <div className="field">
                    <label htmlFor="resize-width">Width &times; height (px)</label>
                    <div className="resize-inputs">
                      <input
                        id="resize-width"
                        type="number"
                        min="1"
                        value={resizeWidth}
                        onChange={(event) => handleWidthChange(event.target.value)}
                      />
                      <span className="resize-separator">&times;</span>
                      <input
                        type="number"
                        min="1"
                        aria-label="Height in pixels"
                        value={resizeHeight}
                        onChange={(event) => handleHeightChange(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mode-toggle">
                    {[0.25, 0.5, 0.75, 1].map((percent) => (
                      <button
                        key={percent}
                        type="button"
                        className="mode-button"
                        onClick={() => applyScale(percent)}
                      >
                        {percent * 100}%
                      </button>
                    ))}
                  </div>

                  <p className="field-hint">
                    Original: {dimensions.width}&times;{dimensions.height} px &rarr; New:{' '}
                    {resizeWidth || '?'}&times;{resizeHeight || '?'} px
                  </p>
                  {resizeWidth > dimensions.width && (
                    <p className="field-hint">
                      Enlarging beyond the original size won't add detail — expect a softer,
                      blurrier result.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="mode-toggle" role="radiogroup" aria-label="Crop aspect ratio">
                    {Object.keys(ASPECT_PRESETS).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={aspectPreset === key ? 'mode-button active' : 'mode-button'}
                        aria-pressed={aspectPreset === key}
                        onClick={() => {
                          setAspectPreset(key);
                          setCropBox(maxBoxForAspect(ASPECT_PRESETS[key], imageAspect));
                        }}
                      >
                        {key === 'free' ? 'Free' : key}
                      </button>
                    ))}
                  </div>

                  <div className="crop-preview-wrapper" ref={cropWrapperRef}>
                    <img src={sourceUrl} alt="" className="crop-preview-image" draggable={false} />
                    <div
                      className="crop-box"
                      style={{
                        left: `${cropBox.x * 100}%`,
                        top: `${cropBox.y * 100}%`,
                        width: `${cropBox.width * 100}%`,
                        height: `${cropBox.height * 100}%`,
                      }}
                      onPointerDown={startMove}
                    >
                      {['nw', 'ne', 'sw', 'se'].map((handle) => (
                        <span
                          key={handle}
                          className={`crop-handle crop-handle-${handle}`}
                          onPointerDown={(event) => startResize(event, handle)}
                        />
                      ))}
                    </div>
                  </div>

                  <p className="field-hint">
                    Selection: {Math.round(cropBox.width * dimensions.width)}&times;
                    {Math.round(cropBox.height * dimensions.height)} px
                  </p>

                  <button type="button" className="download-button" onClick={handleApplyCrop}>
                    Apply Crop
                  </button>
                </>
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
                    Result
                    {isConverting && <span className="converting-badge">Working…</span>}
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
                          <dd>{formatBytes(outputBlob.size)}</dd>
                        </div>
                        {outputDimensions && (
                          <div>
                            <dt>Dimensions</dt>
                            <dd>
                              {outputDimensions.width}&times;{outputDimensions.height}
                            </dd>
                          </div>
                        )}
                      </dl>
                      <a
                        className="download-button"
                        href={outputUrl}
                        download={buildDownloadName(file.name, outputBlob.type)}
                        onClick={() => setDownloadedBlob(outputBlob)}
                      >
                        Download result
                      </a>
                    </>
                  ) : (
                    <p className="category-empty">
                      {mode === 'crop'
                        ? 'Adjust the selection, then click "Apply Crop".'
                        : isConverting
                          ? 'Working on it…'
                          : 'Waiting…'}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          Resizing changes an image's overall dimensions; cropping cuts out just a rectangular
          region of it. This tool does both, entirely in your browser, using the same canvas
          technique under the hood — pick whichever mode matches what you actually need to change.
        </p>

        <h2>How it works</h2>
        <p>
          Both modes use the Canvas API's 9-argument <code>drawImage()</code>, which lets you map
          a source rectangle onto a destination rectangle of a different size or position.
          Resizing maps the whole source image onto a destination canvas sized to your new
          width/height; cropping maps just the selected region onto a destination the same size
          as that selection.
        </p>

        <h2>Resize vs crop — which do you need?</h2>
        <ul>
          <li>
            <strong>Resize</strong> when the whole image is right but it needs to be a different
            size — e.g. shrinking a photo to fit a website's layout.
          </li>
          <li>
            <strong>Crop</strong> when only part of the image is what you want — e.g. cutting a
            square profile picture out of a wider photo.
          </li>
        </ul>

        <h2>Understanding aspect ratio</h2>
        <p>
          Aspect ratio is the relationship between width and height (e.g. 16:9, 1:1). With "Lock
          aspect ratio" on, changing one resize dimension automatically adjusts the other to keep
          the image looking the same, just bigger or smaller — turning it off lets you set both
          independently, which will stretch or squash the image if they don't match the original
          ratio.
        </p>

        <h2>Common mistakes</h2>
        <ul>
          <li>Enlarging an image far beyond its original size expecting it to look sharp — upscaling can't invent detail that wasn't captured in the first place.</li>
          <li>Unlocking aspect ratio and setting mismatched dimensions unintentionally, which visibly distorts the image.</li>
          <li>Cropping a tiny selection from a large photo and expecting a large, detailed result — the crop's resolution is limited by the pixels available in that region.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Will resizing up add more detail to my image?</h3>
          <p>No — enlarging stretches existing pixels rather than inventing new detail, so very large upscales tend to look soft or blurry.</p>
        </div>
        <div className="faq-item">
          <h3>Can I crop to an exact aspect ratio like 1:1 or 16:9?</h3>
          <p>Yes — the crop mode's aspect presets constrain the selection box to that ratio while you drag it.</p>
        </div>
        <div className="faq-item">
          <h3>Does cropping reduce file size?</h3>
          <p>Usually, since there are fewer pixels to store — but for maximum size savings after cropping, run the result through the <Link to="/tool/image-compressor">Image Compressor</Link>.</p>
        </div>
        <div className="faq-item">
          <h3>Why did my transparent image turn white?</h3>
          <p>You likely selected JPEG as the output format — JPEG has no transparency channel. Choose PNG or WebP to keep transparency.</p>
        </div>
        <div className="faq-item">
          <h3>Is my image uploaded anywhere?</h3>
          <p>No — both resizing and cropping happen entirely in your browser using the Canvas API.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/graphics-media">Graphics &amp; Media tools</Link> on
          Toolbox.
        </p>
      </article>
    </div>
  );
}
