import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { FORMATS, FORMAT_BY_MIME, validateImageDimensions, validateImageFile } from '../image-flipper/imageFlipUtils.js';
import {
  BACKGROUNDS,
  FIT_MODES,
  buildDownloadName,
  canvasToBlob,
  layout,
  normalizeAngle,
  renderRotated,
} from './rotateUtils.js';

const PREVIEW_MAX = 900;

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ImageRotator() {
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);
  const imageRef = useRef(null);
  const frameRef = useRef(0);

  const [file, setFile] = useState(null);
  const [dimensions, setDimensions] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Rotation = quarter turns from the buttons + fine angle from the slider.
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [fineAngle, setFineAngle] = useState(0);
  const [fit, setFit] = useState('expand');
  const [background, setBackground] = useState('transparent');
  const [customColor, setCustomColor] = useState('#5b3df5');
  const [format, setFormat] = useState('image/png');

  const [output, setOutput] = useState(null); // { blob, url, width, height }
  const [isExporting, setIsExporting] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState('');

  const degrees = normalizeAngle(quarterTurns * 90 + fineAngle);
  const fill = background === 'custom' ? customColor : background;
  const settings = { degrees, fit, background: fill, mime: format };

  // Decode the chosen file once.
  useEffect(() => {
    if (!file) {
      imageRef.current = null;
      setDimensions(null);
      return;
    }
    const url = URL.createObjectURL(file);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const check = validateImageDimensions(img.naturalWidth, img.naturalHeight);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      imageRef.current = img;
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => !cancelled && setError('Could not read that image file.');
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Live preview, redrawn at most once per frame while the slider moves.
  useEffect(() => {
    const img = imageRef.current;
    const canvas = previewRef.current;
    if (!img || !canvas || !dimensions) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const out = layout(dimensions.width, dimensions.height, degrees, fit);
      const size = Math.min(1, PREVIEW_MAX / Math.max(out.width, out.height));
      const rendered = renderRotated(img, settings, size);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext('2d').drawImage(rendered, 0, 0);
    });
    return () => cancelAnimationFrame(frameRef.current);
    // `settings` is rebuilt every render from the values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions, degrees, fit, fill, format]);

  // Any change makes the prepared download stale.
  useEffect(() => {
    setOutput((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setDownloaded(false);
  }, [file, degrees, fit, fill, format]);

  function loadFile(selected) {
    if (!selected) return;
    const validation = validateImageFile(selected);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError('');
    setQuarterTurns(0);
    setFineAngle(0);
    setFile(selected);
  }

  function reset() {
    setFile(null);
    setQuarterTurns(0);
    setFineAngle(0);
    setError('');
  }

  const rotated = degrees !== 0;
  const hasUnsavedWork = Boolean(file) && rotated && !downloaded;
  useUnsavedChangesWarning(hasUnsavedWork);

  function confirmThen(action, newFile = null) {
    if (hasUnsavedWork) {
      setPendingFile(newFile);
      setShowConfirm(true);
    } else {
      action();
    }
  }
  usePasteToUpload(true, (pasted) => confirmThen(() => loadFile(pasted), pasted));

  async function handleExport() {
    if (!imageRef.current) return;
    setIsExporting(true);
    setError('');
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const canvas = renderRotated(imageRef.current, settings, 1);
      const blob = await canvasToBlob(canvas, format);
      setOutput((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
      });
    } catch (exportError) {
      setError(exportError.message || 'Something went wrong creating the image.');
    } finally {
      setIsExporting(false);
    }
  }

  const outSize = dimensions ? layout(dimensions.width, dimensions.height, degrees, fit) : null;
  const showsBackground = fit === 'expand' || (fit === 'crop' && degrees % 90 !== 0);

  return (
    <div className="image-rotator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {showConfirm && (
        <ConfirmDialog
          title="Discard this rotation?"
          message={
            pendingFile
              ? "You haven't downloaded the rotated image yet. Pasting a new one will discard it."
              : "You haven't downloaded the rotated image yet. Choosing another image will discard it."
          }
          confirmLabel={pendingFile ? 'Discard and load pasted image' : 'Discard and choose another'}
          onCancel={() => {
            setShowConfirm(false);
            setPendingFile(null);
          }}
          onConfirm={() => {
            setShowConfirm(false);
            if (pendingFile) loadFile(pendingFile);
            else reset();
            setPendingFile(null);
          }}
        />
      )}

      {!file ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, paste, or click to choose an image to rotate"
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
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            loadFile(event.dataTransfer.files[0]);
          }}
        >
          <p className="drop-zone-title">Drag &amp; drop, paste, or click to browse</p>
          <p className="drop-zone-hint">Rotate by 90°, 180°, or any angle - straighten tilted photos</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            aria-label="Choose an image file"
            onChange={(event) => {
              loadFile(event.target.files[0]);
              event.target.value = '';
            }}
          />
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={() => confirmThen(reset)}>
              &larr; Choose a different image
            </button>
          </div>

          {!dimensions ? (
            error ? <p className="field-error">{error}</p> : <p className="category-empty">Loading image…</p>
          ) : (
            <div className="filters-layout">
              <div className="filters-preview">
                <div className="filters-canvas-frame">
                  <canvas ref={previewRef} className="filters-canvas" aria-label="Preview of the rotated image" />
                </div>
                <p className="field-hint">
                  {dimensions.width}&times;{dimensions.height} &rarr; {outSize.width}&times;{outSize.height} &middot;{' '}
                  {formatBytes(file.size)}
                </p>
              </div>

              <div className="filters-controls">
                <div className="field">
                  <span className="filters-label">Rotate</span>
                  <div className="rotate-buttons">
                    <button type="button" className="ghost-button" onClick={() => setQuarterTurns((q) => q - 1)}>
                      &#8634; 90° left
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setQuarterTurns((q) => q + 1)}>
                      &#8635; 90° right
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setQuarterTurns((q) => q + 2)}>
                      180°
                    </button>
                  </div>
                </div>

                <div className="field filters-slider">
                  <div className="filters-slider-header">
                    <label htmlFor="rotate-fine">Fine angle (straighten)</label>
                    <button
                      type="button"
                      className="filters-value"
                      title="Reset"
                      onClick={() => setFineAngle(0)}
                      disabled={fineAngle === 0}
                    >
                      {fineAngle > 0 ? '+' : ''}
                      {fineAngle}°
                    </button>
                  </div>
                  <input
                    id="rotate-fine"
                    type="range"
                    min={-45}
                    max={45}
                    step={0.5}
                    value={fineAngle}
                    onChange={(event) => setFineAngle(Number(event.target.value))}
                    onDoubleClick={() => setFineAngle(0)}
                  />
                </div>

                <p className="rotate-total">
                  Total rotation: <strong>{degrees}°</strong> {degrees !== 0 && (degrees > 0 ? 'clockwise' : 'counter-clockwise')}
                </p>

                <div className="field">
                  <label htmlFor="rotate-fit">Edges</label>
                  <select id="rotate-fit" value={fit} onChange={(event) => setFit(event.target.value)}>
                    {FIT_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">{FIT_MODES.find((m) => m.id === fit).hint}</p>
                </div>

                {showsBackground && degrees % 90 !== 0 && (
                  <div className="field">
                    <label htmlFor="rotate-background">Corner color</label>
                    <div className="pdf-password-row">
                      <select id="rotate-background" value={background} onChange={(event) => setBackground(event.target.value)}>
                        {BACKGROUNDS.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                      {background === 'custom' && (
                        <input
                          type="color"
                          aria-label="Custom corner color"
                          value={customColor}
                          onChange={(event) => setCustomColor(event.target.value)}
                        />
                      )}
                    </div>
                    {background === 'transparent' && format === 'image/jpeg' && (
                      <p className="field-hint">JPG can&apos;t be transparent, so the corners will be white.</p>
                    )}
                  </div>
                )}

                <div className="field">
                  <label htmlFor="rotate-format">Download format</label>
                  <select id="rotate-format" value={format} onChange={(event) => setFormat(event.target.value)}>
                    {FORMATS.map((f) => (
                      <option key={f.mime} value={f.mime}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="field-error">{error}</p>}

                <div className="converter-toolbar">
                  {output ? (
                    <a
                      className="download-button"
                      href={output.url}
                      download={buildDownloadName(file.name, FORMAT_BY_MIME[format].extension)}
                      onClick={() => setDownloaded(true)}
                    >
                      Download {FORMAT_BY_MIME[format].label} ({formatBytes(output.blob.size)})
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="download-button"
                      onClick={handleExport}
                      disabled={isExporting || !rotated}
                    >
                      {isExporting ? 'Preparing…' : rotated ? 'Apply & prepare download' : 'Rotate the image first'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setQuarterTurns(0);
                      setFineAngle(0);
                    }}
                    disabled={!rotated}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          Image Rotator turns a picture by 90°, 180°, or any angle in between - for sideways phone
          photos, upside-down scans, or a horizon that&apos;s slightly tilted. It runs entirely in
          your browser, at full resolution, without uploading anything.
        </p>

        <h2>How to rotate an image</h2>
        <ol>
          <li>Drop, paste, or choose a PNG, JPG, or WebP image.</li>
          <li>Use the 90° buttons for sideways or upside-down images, and the slider to straighten small tilts.</li>
          <li>Choose how the edges are handled, then download the result.</li>
        </ol>

        <h2>Straightening a tilted photo</h2>
        <p>
          Rotating by an angle that isn&apos;t a multiple of 90° leaves empty triangles in the
          corners. <strong>Fit whole image</strong> keeps every pixel and fills the corners with a
          color (or transparency). <strong>Keep original size</strong> keeps the dimensions and cuts
          the corners off. <strong>Zoom to fill</strong> enlarges the picture just enough that no
          empty corners show - usually the best choice for a crooked horizon.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Does rotating reduce quality?</h3>
          <p>Not for 90° and 180° turns - pixels are moved, not recalculated, so the result is exact. Any other angle has to blend neighboring pixels, which softens the image very slightly, as in every photo editor.</p>
        </div>
        <div className="faq-item">
          <h3>Why does my phone photo look rotated differently here?</h3>
          <p>Phones often save photos sideways with a note (EXIF orientation) saying how to display them. This tool shows the photo the way it&apos;s meant to be displayed and saves the rotation into the pixels, so it looks right everywhere.</p>
        </div>
        <div className="faq-item">
          <h3>Is my image uploaded?</h3>
          <p>No - rotation happens on your device using the Canvas API.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Mirror an image with the <Link to="/tool/image-flipper">Image Flipper</Link>, change its
          size with the <Link to="/tool/image-resizer">Image Resizer &amp; Cropper</Link>, or browse all{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
