import { useEffect, useRef, useState } from 'react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

// --- Helpers -----------------------------------------------------------------

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Maps an actual output mime type (what the browser really produced) to a
// file extension for the download name. Keyed by the real blob type rather
// than what we asked for, because unsupported formats silently fall back
// to PNG (see the "Browsers that don't support..." comment below).
const EXTENSION_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function buildDownloadName(originalName, mime) {
  const base = originalName.replace(/\.[^./]+$/, ''); // strip the original extension
  const extension = EXTENSION_BY_MIME[mime] ?? 'bin';
  return `${base}-compressed.${extension}`;
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> — the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ImageCompressor() {
  const fileInputRef = useRef(null);
  // Holds the loaded <img> element between renders, so the encoding effect
  // (below) can redraw it onto a canvas without re-decoding the file every
  // time the user nudges the quality slider.
  const imageElRef = useRef(null);

  const [file, setFile] = useState(null); // the original File the user picked
  const [sourceUrl, setSourceUrl] = useState(''); // object URL for the original preview
  const [dimensions, setDimensions] = useState(null); // { width, height } of the original
  const [hasTransparency, setHasTransparency] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 'original' keeps the source file's own format; otherwise this is the
  // exact mime type to hand to canvas.toBlob().
  const [formatChoice, setFormatChoice] = useState('image/webp');
  const [quality, setQuality] = useState(0.8);
  // Left blank (meaning "no limit") until the user types a value.
  const [maxWidth, setMaxWidth] = useState('');
  const [maxHeight, setMaxHeight] = useState('');

  const [outputBlob, setOutputBlob] = useState(null);
  const [outputUrl, setOutputUrl] = useState(''); // object URL for the compressed preview
  const [outputDimensions, setOutputDimensions] = useState(null);
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

  // Loads the image once per file, and while we're at it checks whether it
  // has any actually-transparent pixels — used later to warn before
  // compressing to JPEG, which has no transparency channel.
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

  // The actual compression: draw the (optionally resized) image onto an
  // off-screen canvas, then ask the canvas to export itself at the chosen
  // quality. Re-runs whenever format, quality, or the resize limits change.
  useEffect(() => {
    if (!sourceUrl || !dimensions || !imageElRef.current || !file) return;

    const img = imageElRef.current;
    let cancelled = false;
    setIsConverting(true);
    setError('');

    const outputMime = formatChoice === 'original' ? file.type : formatChoice;

    // Shrink to fit within maxWidth/maxHeight if either was set, keeping
    // the original aspect ratio. Blank inputs count as "no limit".
    let targetWidth = img.naturalWidth;
    let targetHeight = img.naturalHeight;
    const limitWidth = Number(maxWidth) || Infinity;
    const limitHeight = Number(maxHeight) || Infinity;
    if (limitWidth < targetWidth || limitHeight < targetHeight) {
      const scale = Math.min(limitWidth / targetWidth, limitHeight / targetHeight, 1);
      targetWidth = Math.max(1, Math.round(targetWidth * scale));
      targetHeight = Math.max(1, Math.round(targetHeight * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (outputMime === 'image/jpeg') {
      // JPEG has no transparency channel — without this, transparent
      // areas would turn black instead of staying white.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // PNG is lossless: canvas ignores the quality argument entirely for it.
    const isPng = outputMime === 'image/png';

    canvas.toBlob(
      (blob) => {
        if (cancelled) return;
        if (!blob) {
          setError("Your browser couldn't compress this image.");
          setIsConverting(false);
          return;
        }
        // Browsers that don't support the requested format silently fall
        // back to PNG — let the user know instead of pretending it worked.
        if (blob.type !== outputMime) {
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
      outputMime,
      isPng ? undefined : quality,
    );

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, dimensions, formatChoice, quality, maxWidth, maxHeight, file]);

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
    setOutputBlob(null);
    setOutputDimensions(null);
    setOutputUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }

  // "Choose a different image" throws away the current file/result — if
  // there's unsaved work, confirm first instead of silently discarding it.
  // (This doesn't navigate anywhere, so UnsavedChangesGuard can't catch it
  // on its own — it only watches for page-to-page navigation.)
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

  // PNG output is lossless, so the quality slider has no effect on it —
  // guide the user toward WebP/JPEG instead of leaving them guessing.
  const isOriginalPng = formatChoice === 'original' && file?.type === 'image/png';
  const showTransparencyWarning = formatChoice === 'image/jpeg' && hasTransparency;

  const percentSaved =
    outputBlob && file ? Math.round(((file.size - outputBlob.size) / file.size) * 100) : null;

  // "Unsaved work" means: a file is loaded, and either there's no result
  // yet or the current result isn't the one that's been downloaded.
  const hasUnsavedWork = Boolean(file) && (!outputBlob || outputBlob !== downloadedBlob);
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="image-compressor">
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
          <p className="drop-zone-title">Drag & drop an image here, or click to browse</p>
          <p className="drop-zone-hint">Shrinks PNG, JPG, WebP, and more</p>
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
              message="You have unsaved work on this image. Choosing a different one will discard it."
              confirmLabel="Discard and choose another"
              onCancel={() => setShowResetConfirm(false)}
              onConfirm={() => {
                setShowResetConfirm(false);
                handleReset();
              }}
            />
          )}

          <div className="field">
            <label htmlFor="format">Output format</label>
            <select
              id="format"
              value={formatChoice}
              onChange={(event) => setFormatChoice(event.target.value)}
            >
              <option value="image/webp">WebP (best compression)</option>
              <option value="image/jpeg">JPEG</option>
              <option value="original">Keep original ({file.type || 'unknown'})</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="quality">Quality: {Math.round(quality * 100)}%</label>
            <input
              id="quality"
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={quality}
              disabled={isOriginalPng}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
            {isOriginalPng && (
              <p className="field-hint">
                PNG is lossless, so quality doesn't change its size. Pick WebP or JPEG above for
                real savings.
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="max-width">Resize before compressing (optional)</label>
            <div className="resize-inputs">
              <input
                id="max-width"
                type="number"
                min="1"
                placeholder="Max width (px)"
                value={maxWidth}
                onChange={(event) => setMaxWidth(event.target.value)}
              />
              <span className="resize-separator">&times;</span>
              <input
                type="number"
                min="1"
                placeholder="Max height (px)"
                aria-label="Max height in pixels"
                value={maxHeight}
                onChange={(event) => setMaxHeight(event.target.value)}
              />
            </div>
            <p className="field-hint">
              Leave blank to keep the original dimensions. Shrinking the image is often the
              biggest size win.
            </p>
          </div>

          {showTransparencyWarning && (
            <p className="field-error">
              This image has transparency, which JPEG doesn't support — transparent areas will
              turn white. Consider WebP instead.
            </p>
          )}

          {error && <p className="field-error">{error}</p>}

          {percentSaved !== null && (
            <div className="compression-stat">
              <div className={`compression-stat-percent ${percentSaved >= 0 ? 'smaller' : 'larger'}`}>
                {percentSaved >= 0
                  ? `${percentSaved}% smaller`
                  : `${Math.abs(percentSaved)}% larger`}
              </div>
              <div className="compression-stat-detail">
                {formatBytes(file.size)} &rarr; {formatBytes(outputBlob.size)}
              </div>
            </div>
          )}

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
                Compressed
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
                    Download compressed image
                  </a>
                </>
              ) : (
                <p className="category-empty">{isConverting ? 'Working on it…' : 'Waiting…'}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
