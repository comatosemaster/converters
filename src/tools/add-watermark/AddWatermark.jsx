import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { FORMATS, FORMAT_BY_MIME, validateImageDimensions, validateImageFile } from '../image-flipper/imageFlipUtils.js';
import { DEFAULT_SETTINGS, FONTS, POSITIONS, renderWatermarked, watermarkedName } from './addWatermarkUtils.js';
import { canvasToBlob } from '../image-rotator/rotateUtils.js';

const PREVIEW_MAX = 900;
let nextId = 1;

function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image file.'));
    };
    img.src = url;
  });
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function AddWatermark() {
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const previewRef = useRef(null);
  const frameRef = useRef(0);

  const [images, setImages] = useState([]); // { id, file, img, url }
  const [selectedId, setSelectedId] = useState(null);
  const [logo, setLogo] = useState(null); // { img, url, name }
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [format, setFormat] = useState('image/jpeg');
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [output, setOutput] = useState(null); // { url, name, size }
  const [downloaded, setDownloaded] = useState(false);

  const selected = images.find((i) => i.id === selectedId) ?? images[0];

  // Free object URLs when leaving the page.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => () => imagesRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  // Live preview of the selected image.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !selected) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const scale = Math.min(1, PREVIEW_MAX / Math.max(selected.img.naturalWidth, selected.img.naturalHeight));
      const rendered = renderWatermarked(selected.img, settings, logo?.img, scale);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext('2d').drawImage(rendered, 0, 0);
    });
    return () => cancelAnimationFrame(frameRef.current);
  }, [selected, settings, logo]);

  // Any change makes the prepared download stale.
  useEffect(() => {
    setOutput((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setDownloaded(false);
  }, [images, settings, logo, format]);

  async function addFiles(fileList) {
    const files = Array.from(fileList ?? []);
    const added = [];
    const problems = [];
    for (const file of files) {
      const check = validateImageFile(file);
      if (!check.ok) {
        problems.push(`${file.name}: ${check.error}`);
        continue;
      }
      try {
        const { img, url } = await decode(file);
        const dims = validateImageDimensions(img.naturalWidth, img.naturalHeight);
        if (!dims.ok) {
          URL.revokeObjectURL(url);
          problems.push(`${file.name}: ${dims.error}`);
          continue;
        }
        added.push({ id: nextId++, file, img, url });
      } catch (decodeError) {
        problems.push(`${file.name}: ${decodeError.message}`);
      }
    }
    if (added.length) {
      setImages((prev) => [...prev, ...added]);
      setSelectedId((current) => current ?? added[0].id);
    }
    setErrors(problems);
  }

  async function chooseLogo(file) {
    if (!file) return;
    try {
      const { img, url } = await decode(file);
      if (logo) URL.revokeObjectURL(logo.url);
      setLogo({ img, url, name: file.name });
      setSettings((s) => ({ ...s, type: 'logo' }));
    } catch {
      setErrors(['Could not read that logo image - try a PNG.']);
    }
  }

  usePasteToUpload(true, (file) => addFiles([file]));

  function set(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function removeImage(id) {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  }

  async function handleExport() {
    setIsExporting(true);
    setProgress({ done: 0, total: images.length });
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const ext = FORMAT_BY_MIME[format].extension;
      if (images.length === 1) {
        const canvas = renderWatermarked(images[0].img, settings, logo?.img, 1, format);
        const blob = await canvasToBlob(canvas, format);
        setOutput({ url: URL.createObjectURL(blob), name: watermarkedName(images[0].file.name, ext), size: blob.size });
      } else {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        const used = new Set();
        for (let i = 0; i < images.length; i++) {
          const canvas = renderWatermarked(images[i].img, settings, logo?.img, 1, format);
          const blob = await canvasToBlob(canvas, format);
          let name = watermarkedName(images[i].file.name, ext);
          for (let n = 2; used.has(name); n++) name = watermarkedName(`${images[i].file.name}-${n}`, ext);
          used.add(name);
          zip.file(name, blob);
          setProgress({ done: i + 1, total: images.length });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        setOutput({ url: URL.createObjectURL(blob), name: 'watermarked-images.zip', size: blob.size });
      }
    } catch (exportError) {
      setErrors([exportError.message || 'Something went wrong creating the images.']);
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  }

  const hasUnsavedWork = images.length > 0 && !downloaded;
  useUnsavedChangesWarning(hasUnsavedWork);

  function clearAll() {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
    setSelectedId(null);
    setErrors([]);
  }

  const isLogo = settings.type === 'logo';

  return (
    <div className="add-watermark">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {showClearConfirm && (
        <ConfirmDialog
          title="Remove all images?"
          message="You haven't downloaded the watermarked images yet. Clearing removes them from the list."
          confirmLabel="Discard and clear"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            setShowClearConfirm(false);
            clearAll();
          }}
        />
      )}

      {images.length === 0 && (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, paste, or click to choose images to watermark"
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
            addFiles(event.dataTransfer.files);
          }}
        >
          <p className="drop-zone-title">Drag &amp; drop, paste, or click to browse</p>
          <p className="drop-zone-hint">One image or a whole batch - the same watermark goes on all of them</p>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="visually-hidden"
        aria-label="Choose images"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {errors.length > 0 && (
        <div className="field-error">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {selected && (
        <div className="filters-layout">
          <div className="filters-preview">
            <div className="filters-canvas-frame">
              <canvas ref={previewRef} className="filters-canvas" aria-label="Preview of the watermarked image" />
            </div>
            {images.length > 1 && (
              <ul className="watermark-thumbs" aria-label="Images to watermark">
                {images.map((image) => (
                  <li key={image.id} className={image.id === selected.id ? 'active' : ''}>
                    <button type="button" onClick={() => setSelectedId(image.id)} aria-label={`Preview ${image.file.name}`}>
                      <img src={image.url} alt="" />
                    </button>
                    <button type="button" className="watermark-thumb-remove" onClick={() => removeImage(image.id)} aria-label={`Remove ${image.file.name}`}>
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="converter-toolbar">
              <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
                + Add images
              </button>
              <span className="field-hint">
                {images.length} image{images.length === 1 ? '' : 's'} &middot; {selected.img.naturalWidth}&times;{selected.img.naturalHeight} &middot;{' '}
                {formatBytes(selected.file.size)}
              </span>
            </div>
          </div>

          <div className="filters-controls">
            <div className="mode-toggle" role="radiogroup" aria-label="Watermark type">
              {[
                ['text', 'Text'],
                ['logo', 'Logo image'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={settings.type === id}
                  className={settings.type === id ? 'mode-button active' : 'mode-button'}
                  onClick={() => set('type', id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {!isLogo ? (
              <>
                <div className="field">
                  <label htmlFor="wm-text">Text</label>
                  <input id="wm-text" type="text" value={settings.text} onChange={(event) => set('text', event.target.value)} />
                </div>
                <div className="unit-converter-row">
                  <div className="field">
                    <label htmlFor="wm-font">Font</label>
                    <select id="wm-font" value={settings.font} onChange={(event) => set('font', event.target.value)}>
                      {FONTS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="wm-color">Color</label>
                    <input id="wm-color" type="color" value={settings.color} onChange={(event) => set('color', event.target.value)} />
                  </div>
                </div>
                <label className="checkbox-field">
                  <input type="checkbox" checked={settings.bold} onChange={(event) => set('bold', event.target.checked)} />
                  Bold
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={settings.outline} onChange={(event) => set('outline', event.target.checked)} />
                  Outline (readable on any background)
                </label>
              </>
            ) : (
              <div className="field">
                <span className="filters-label">Logo</span>
                <div className="converter-toolbar">
                  <button type="button" className="ghost-button" onClick={() => logoInputRef.current?.click()}>
                    {logo ? 'Change logo' : 'Choose a logo image'}
                  </button>
                  {logo && <span className="field-hint">{logo.name}</span>}
                </div>
                <p className="field-hint">A PNG with a transparent background works best.</p>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="visually-hidden"
                  aria-label="Choose a logo image"
                  onChange={(event) => {
                    chooseLogo(event.target.files[0]);
                    event.target.value = '';
                  }}
                />
              </div>
            )}

            {[
              ['size', 'Size', 1, 30, '%'],
              ['opacity', 'Opacity', 5, 100, '%'],
              ['angle', 'Angle', -90, 90, '°'],
            ].map(([key, label, min, max, unit]) => (
              <div className="field filters-slider" key={key}>
                <div className="filters-slider-header">
                  <label htmlFor={`wm-${key}`}>{label}</label>
                  <span className="filters-value">
                    {settings[key]}
                    {unit}
                  </span>
                </div>
                <input
                  id={`wm-${key}`}
                  type="range"
                  min={min}
                  max={max}
                  value={settings[key]}
                  onChange={(event) => set(key, Number(event.target.value))}
                />
              </div>
            ))}

            <div className="field">
              <span className="filters-label">Position</span>
              <div className="watermark-positions" role="radiogroup" aria-label="Position">
                {POSITIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={settings.position === p}
                    aria-label={p.replace('-', ' ')}
                    title={p.replace('-', ' ')}
                    className={settings.position === p ? 'active' : ''}
                    onClick={() => set('position', p)}
                  />
                ))}
              </div>
              <button
                type="button"
                className={settings.position === 'tile' ? 'filters-preset active' : 'filters-preset'}
                aria-pressed={settings.position === 'tile'}
                onClick={() => setSettings((s) => ({ ...s, position: 'tile', angle: s.angle === 0 ? -30 : s.angle }))}
              >
                Tile across the whole image
              </button>
            </div>

            {settings.position !== 'tile' ? (
              <div className="field filters-slider">
                <div className="filters-slider-header">
                  <label htmlFor="wm-margin">Distance from edge</label>
                  <span className="filters-value">{settings.margin}%</span>
                </div>
                <input id="wm-margin" type="range" min={0} max={20} value={settings.margin} onChange={(event) => set('margin', Number(event.target.value))} />
              </div>
            ) : (
              <div className="field filters-slider">
                <div className="filters-slider-header">
                  <label htmlFor="wm-gap">Spacing</label>
                  <span className="filters-value">{settings.tileGap}%</span>
                </div>
                <input id="wm-gap" type="range" min={20} max={300} value={settings.tileGap} onChange={(event) => set('tileGap', Number(event.target.value))} />
              </div>
            )}

            <div className="field">
              <label htmlFor="wm-format">Download format</label>
              <select id="wm-format" value={format} onChange={(event) => setFormat(event.target.value)}>
                {FORMATS.map((f) => (
                  <option key={f.mime} value={f.mime}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="converter-toolbar">
              {output ? (
                <a className="download-button" href={output.url} download={output.name} onClick={() => setDownloaded(true)}>
                  Download {images.length > 1 ? `ZIP of ${images.length} images` : FORMAT_BY_MIME[format].label} ({formatBytes(output.size)})
                </a>
              ) : (
                <button
                  type="button"
                  className="download-button"
                  onClick={handleExport}
                  disabled={isExporting || (isLogo && !logo) || (!isLogo && !settings.text.trim())}
                >
                  {isExporting && progress
                    ? `Watermarking… ${progress.done}/${progress.total}`
                    : images.length > 1
                      ? `Watermark all ${images.length} images`
                      : 'Apply & prepare download'}
                </button>
              )}
              <button type="button" className="ghost-button" onClick={() => (hasUnsavedWork ? setShowClearConfirm(true) : clearAll())}>
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      <article className="tool-article">
        <p>
          Add a watermark - your name, website, or logo - to photos and images before sharing them
          online. Watermark one picture or a whole batch at once; everything happens in your browser,
          and your images are never uploaded.
        </p>

        <h2>How to watermark images</h2>
        <ol>
          <li>Drop one or more PNG, JPG, or WebP images into the box.</li>
          <li>Type your watermark text, or switch to <strong>Logo image</strong> and choose a logo (a transparent PNG works best).</li>
          <li>Adjust size, opacity, angle and position - or tile it across the whole image.</li>
          <li>Download the result; several images come as one ZIP.</li>
        </ol>

        <h2>Making a watermark that works</h2>
        <ul>
          <li><strong>Corner watermarks</strong> are subtle and keep the photo clean - good for credit, but easy to crop out.</li>
          <li><strong>Tiled watermarks</strong> cover the whole image diagonally, which is much harder to remove - the usual choice for proofs and previews.</li>
          <li>Opacity around 30-60% stays visible without ruining the picture. The outline option keeps text readable on both light and dark areas.</li>
        </ul>
        <p>
          Size and margins are relative to each image, so the watermark looks the same on every photo in
          a batch, whatever its resolution.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Are my images uploaded?</h3>
          <p>No - watermarks are drawn on your device using the Canvas API, at each image&apos;s full resolution.</p>
        </div>
        <div className="faq-item">
          <h3>Can a watermark be removed?</h3>
          <p>A small corner mark can be cropped or painted over fairly easily. A semi-transparent, tiled watermark across the subject is far harder to remove cleanly.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Remove an unwanted mark with the <Link to="/tool/watermark-remover">Watermark Remover</Link>, shrink
          files with the <Link to="/tool/image-compressor">Image Compressor</Link>, or browse all{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
