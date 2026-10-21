import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import {
  FORMATS,
  FORMAT_BY_MIME,
  validateImageDimensions,
  validateImageFile,
} from '../image-flipper/imageFlipUtils.js';
import {
  ADJUSTMENTS,
  DEFAULT_SETTINGS,
  PRESETS,
  applyFilters,
  buildDownloadName,
  exportImage,
  isDefault,
  readPixels,
} from './imageFilterUtils.js';

// The live preview works on a copy no bigger than this (longest side), so
// dragging a slider stays smooth even for a 24-megapixel photo. The
// download is always processed at full resolution.
const PREVIEW_MAX = 1000;

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ImageFilters() {
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null); // decoded full-size <img>
  const previewSourceRef = useRef(null); // untouched downscaled pixels
  const frameRef = useRef(0);

  const [file, setFile] = useState(null);
  const [dimensions, setDimensions] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [presetId, setPresetId] = useState('none');
  const [showOriginal, setShowOriginal] = useState(false);
  const [format, setFormat] = useState('image/png');

  const [isExporting, setIsExporting] = useState(false);
  const [output, setOutput] = useState(null); // { blob, url }
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState('');

  // Decode the chosen file once, and keep a downscaled copy of its pixels
  // as the starting point for every preview redraw.
  useEffect(() => {
    if (!file) {
      imageRef.current = null;
      previewSourceRef.current = null;
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
      const scale = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      previewSourceRef.current = readPixels(img, scale);
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setError('Could not read that image file.');
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Redraw the preview whenever a setting changes - at most once per
  // animation frame, so fast slider drags don't queue up stale redraws.
  useEffect(() => {
    const source = previewSourceRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas || !dimensions) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const copy = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
      const result = showOriginal ? copy : applyFilters(copy, settings);
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.getContext('2d').putImageData(result, 0, 0);
    });
    return () => cancelAnimationFrame(frameRef.current);
  }, [settings, showOriginal, dimensions]);

  // Any change makes the last exported file stale.
  useEffect(() => {
    setOutput((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setDownloaded(false);
  }, [settings, format, file]);

  function handleFile(selectedFile) {
    if (!selectedFile) return;
    const validation = validateImageFile(selectedFile);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError('');
    setSettings(DEFAULT_SETTINGS);
    setPresetId('none');
    setFile(selectedFile);
  }

  function handleReset() {
    setFile(null);
    setSettings(DEFAULT_SETTINGS);
    setPresetId('none');
    setError('');
  }

  function updateSetting(id, value) {
    setSettings((prev) => ({ ...prev, [id]: value }));
  }

  function applyPreset(preset) {
    setPresetId(preset.id);
    setSettings({ ...DEFAULT_SETTINGS, ...preset.settings });
  }

  async function handleExport() {
    if (!imageRef.current) return;
    setIsExporting(true);
    setError('');
    // Let the "Preparing…" label paint before the heavy pixel work starts.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const blob = await exportImage(imageRef.current, settings, format);
      setOutput((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch (exportError) {
      setError(exportError.message || 'Something went wrong creating the image.');
    } finally {
      setIsExporting(false);
    }
  }

  const edited = !isDefault(settings);
  const hasUnsavedWork = Boolean(file) && edited && !downloaded;
  useUnsavedChangesWarning(hasUnsavedWork);

  function confirmOr(action, newFile = null) {
    if (hasUnsavedWork) {
      setPendingFile(newFile);
      setShowResetConfirm(true);
    } else {
      action();
    }
  }

  usePasteToUpload(true, (pasted) => confirmOr(() => handleFile(pasted), pasted));

  return (
    <div className="image-filters">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showResetConfirm && (
        <ConfirmDialog
          title="Discard your edits?"
          message={
            pendingFile
              ? "You haven't downloaded the edited image yet. Pasting a new one will discard your edits."
              : "You haven't downloaded the edited image yet. Choosing another image will discard your edits."
          }
          confirmLabel={pendingFile ? 'Discard and load pasted image' : 'Discard and choose another'}
          onCancel={() => {
            setShowResetConfirm(false);
            setPendingFile(null);
          }}
          onConfirm={() => {
            setShowResetConfirm(false);
            if (pendingFile) handleFile(pendingFile);
            else handleReset();
            setPendingFile(null);
          }}
        />
      )}

      {!file ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, paste, or click to choose an image to edit"
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
            handleFile(event.dataTransfer.files[0]);
          }}
        >
          <p className="drop-zone-title">Drag &amp; drop, paste, or click to browse</p>
          <p className="drop-zone-hint">Adjust brightness, contrast, color and more, then download</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            aria-label="Choose an image file"
            onChange={(event) => {
              handleFile(event.target.files[0]);
              event.target.value = '';
            }}
          />
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={() => confirmOr(handleReset)}>
              &larr; Choose a different image
            </button>
          </div>

          {!dimensions ? (
            error ? <p className="field-error">{error}</p> : <p className="category-empty">Loading image…</p>
          ) : (
            <div className="filters-layout">
              <div className="filters-preview">
                <div className="filters-canvas-frame">
                  <canvas ref={canvasRef} className="filters-canvas" aria-label="Preview of the edited image" />
                  {showOriginal && <span className="filters-badge">Original</span>}
                </div>
                <button
                  type="button"
                  className="ghost-button filters-compare"
                  disabled={!edited}
                  onPointerDown={() => setShowOriginal(true)}
                  onPointerUp={() => setShowOriginal(false)}
                  onPointerLeave={() => setShowOriginal(false)}
                  onKeyDown={(event) => event.key === ' ' && setShowOriginal(true)}
                  onKeyUp={() => setShowOriginal(false)}
                >
                  Hold to see original
                </button>
                <p className="field-hint">
                  {dimensions.width}&times;{dimensions.height} &middot; {formatBytes(file.size)} &middot; the
                  download keeps the full resolution
                </p>
              </div>

              <div className="filters-controls">
                <div className="field">
                  <span className="filters-label">Presets</span>
                  <div className="filters-presets">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={presetId === preset.id ? 'filters-preset active' : 'filters-preset'}
                        aria-pressed={presetId === preset.id}
                        onClick={() => applyPreset(preset)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {ADJUSTMENTS.map((adjustment) => (
                  <div className="field filters-slider" key={adjustment.id}>
                    <div className="filters-slider-header">
                      <label htmlFor={`filter-${adjustment.id}`}>{adjustment.label}</label>
                      <button
                        type="button"
                        className="filters-value"
                        title="Reset"
                        onClick={() => updateSetting(adjustment.id, 0)}
                        disabled={settings[adjustment.id] === 0}
                      >
                        {settings[adjustment.id] > 0 && adjustment.min < 0 ? '+' : ''}
                        {settings[adjustment.id]}
                        {adjustment.unit}
                      </button>
                    </div>
                    <input
                      id={`filter-${adjustment.id}`}
                      type="range"
                      min={adjustment.min}
                      max={adjustment.max}
                      value={settings[adjustment.id]}
                      onChange={(event) => updateSetting(adjustment.id, Number(event.target.value))}
                      onDoubleClick={() => updateSetting(adjustment.id, 0)}
                    />
                  </div>
                ))}

                <fieldset className="field password-options-fieldset">
                  <legend>Effects</legend>
                  {[
                    ['grayscale', 'Black & white'],
                    ['sepia', 'Sepia'],
                    ['invert', 'Invert colors'],
                  ].map(([id, label]) => (
                    <label className="checkbox-field" key={id}>
                      <input
                        type="checkbox"
                        checked={settings[id]}
                        onChange={(event) => updateSetting(id, event.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>

                <div className="field">
                  <label htmlFor="filters-format">Download format</label>
                  <select id="filters-format" value={format} onChange={(event) => setFormat(event.target.value)}>
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
                    <button type="button" className="download-button" onClick={handleExport} disabled={isExporting}>
                      {isExporting ? 'Preparing full-size image…' : 'Apply & prepare download'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => applyPreset(PRESETS[0])}
                    disabled={!edited}
                  >
                    Reset all
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          Image Filters &amp; Adjustments lets you fix and restyle a photo right in your browser:
          brighten a dark shot, add punch with contrast and saturation, warm up or cool down the
          colors, sharpen soft details, or apply a one-click look like black &amp; white or
          vintage. Your image is never uploaded.
        </p>

        <h2>How to edit your image</h2>
        <ol>
          <li>Drop, paste, or choose a PNG, JPG, or WebP image.</li>
          <li>Start from a preset, or drag the sliders - the preview updates as you go.</li>
          <li>Hold <strong>Hold to see original</strong> to compare before and after.</li>
          <li>Click <strong>Apply &amp; prepare download</strong>, then download the full-resolution result.</li>
        </ol>

        <h2>What each adjustment does</h2>
        <ul>
          <li><strong>Brightness</strong> lightens or darkens the whole image evenly.</li>
          <li><strong>Contrast</strong> pushes lights lighter and darks darker - or flattens them for a softer, faded look.</li>
          <li><strong>Saturation</strong> makes colors more vivid, or drains them towards grey.</li>
          <li><strong>Warmth</strong> shifts colors towards golden orange or cool blue, like changing a camera&apos;s white balance.</li>
          <li><strong>Hue</strong> rotates every color around the color wheel.</li>
          <li><strong>Sharpen</strong> crisps up edges and fine detail; <strong>Blur</strong> softens the image.</li>
          <li><strong>Vignette</strong> gently darkens the corners to draw the eye to the center.</li>
        </ul>
        <p>Click a slider&apos;s number, or double-click the slider, to reset just that one.</p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my photo uploaded?</h3>
          <p>No - every adjustment is calculated in your browser, on your device. Nothing is sent to a server.</p>
        </div>
        <div className="faq-item">
          <h3>Does it reduce the resolution?</h3>
          <p>No. The preview uses a smaller copy so the sliders feel instant, but the download is processed at the image&apos;s full original size.</p>
        </div>
        <div className="faq-item">
          <h3>Why did my transparent image get a white background?</h3>
          <p>JPG can&apos;t store transparency. Choose PNG or WebP to keep transparent areas.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Change the size with the <Link to="/tool/image-resizer">Image Resizer &amp; Cropper</Link>,
          shrink the file with the <Link to="/tool/image-compressor">Image Compressor</Link>, or browse
          all <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
