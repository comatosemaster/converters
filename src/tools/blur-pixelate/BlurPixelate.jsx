import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { FORMATS, FORMAT_BY_MIME, validateImageDimensions, validateImageFile } from '../image-flipper/imageFlipUtils.js';
import { canvasToBlob } from '../image-rotator/rotateUtils.js';
import { DEFAULT_SETTINGS, EFFECTS, TOOLS, boxFromDrag, redactedName, renderRedacted } from './redactUtils.js';

const PREVIEW_MAX = 1400;

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
//
// Two stacked canvases: the bottom one shows the redacted image (redrawn
// when an area is added or a setting changes), the top one only draws
// outlines - including the area being dragged right now, so dragging
// stays smooth without re-rendering the effect on every mouse move.

export default function BlurPixelate() {
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);
  const overlayRef = useRef(null);
  const draftRef = useRef(null);

  const [image, setImage] = useState(null); // { file, img, url }
  const [shapes, setShapes] = useState([]);
  const [tool, setTool] = useState('rect');
  const [brushSize, setBrushSize] = useState(4); // % of the image's long side
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showOutlines, setShowOutlines] = useState(true);
  const [format, setFormat] = useState('image/jpeg');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'clear' | 'replace'

  const scale = image ? Math.min(1, PREVIEW_MAX / Math.max(image.img.naturalWidth, image.img.naturalHeight)) : 1;
  const hasUnsavedWork = Boolean(image) && shapes.length > 0 && !downloaded;
  useUnsavedChangesWarning(hasUnsavedWork);

  useEffect(() => setDownloaded(false), [shapes, settings, format]);
  useEffect(() => () => image && URL.revokeObjectURL(image.url), [image]);

  // Redraw the redacted preview.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !image) return;
    const frame = requestAnimationFrame(() => {
      const rendered = renderRedacted(image.img, shapes, settings, scale);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext('2d').drawImage(rendered, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [image, shapes, settings, scale]);

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !image) return;
    overlay.width = Math.round(image.img.naturalWidth * scale);
    overlay.height = Math.round(image.img.naturalHeight * scale);
    const ctx = overlay.getContext('2d');
    const list = draftRef.current ? [...(showOutlines ? shapes : []), draftRef.current] : showOutlines ? shapes : [];
    ctx.lineWidth = 2;
    list.forEach((shape) => {
      ctx.setLineDash(shape === draftRef.current ? [] : [6, 4]);
      ctx.strokeStyle = 'rgba(139, 123, 255, 0.95)';
      ctx.beginPath();
      if (shape.type === 'brush') {
        // Brush strokes show as a translucent band of their real width.
        ctx.save();
        ctx.lineWidth = shape.size * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(139, 123, 255, 0.35)';
        shape.points.forEach((p, i) => (i ? ctx.lineTo(p.x * scale, p.y * scale) : ctx.moveTo(p.x * scale, p.y * scale)));
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (shape.type === 'rect') ctx.rect(shape.x * scale, shape.y * scale, shape.w * scale, shape.h * scale);
      else ctx.ellipse((shape.x + shape.w / 2) * scale, (shape.y + shape.h / 2) * scale, (shape.w / 2) * scale, (shape.h / 2) * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
  }, [image, shapes, scale, showOutlines]);

  useEffect(drawOverlay, [drawOverlay]);

  const loadFile = useCallback(async (file) => {
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    try {
      const { img, url } = await decode(file);
      const dims = validateImageDimensions(img.naturalWidth, img.naturalHeight);
      if (!dims.ok) {
        URL.revokeObjectURL(url);
        setError(dims.error);
        return;
      }
      setImage({ file, img, url });
      setShapes([]);
      setError('');
      setFormat(FORMAT_BY_MIME[file.type] ? file.type : 'image/png');
    } catch (decodeError) {
      setError(decodeError.message);
    }
  }, []);

  const requestFile = useCallback(
    (file) => {
      if (!file) return;
      if (hasUnsavedWork) {
        setPendingFile(file);
        setConfirm('replace');
      } else {
        loadFile(file);
      }
    },
    [hasUnsavedWork, loadFile],
  );
  usePasteToUpload(true, requestFile);

  // Ctrl/Cmd+Z removes the last area.
  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && shapes.length) {
        if (event.target.closest?.('input, textarea')) return;
        event.preventDefault();
        setShapes((prev) => prev.slice(0, -1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shapes.length]);

  function toImagePoint(event) {
    const rect = overlayRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * image.img.naturalWidth;
    const y = ((event.clientY - rect.top) / rect.height) * image.img.naturalHeight;
    return {
      x: Math.min(image.img.naturalWidth, Math.max(0, x)),
      y: Math.min(image.img.naturalHeight, Math.max(0, y)),
    };
  }

  function handlePointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = toImagePoint(event);
    const longSide = Math.max(image.img.naturalWidth, image.img.naturalHeight);
    draftRef.current =
      tool === 'brush'
        ? { type: 'brush', points: [p], size: (brushSize / 100) * longSide }
        : { ...boxFromDrag(tool, p.x, p.y, p.x, p.y), start: p };
    drawOverlay();
  }

  function handlePointerMove(event) {
    const draft = draftRef.current;
    if (!draft) return;
    const p = toImagePoint(event);
    draftRef.current = draft.type === 'brush' ? { ...draft, points: [...draft.points, p] } : { ...boxFromDrag(draft.type, draft.start.x, draft.start.y, p.x, p.y), start: draft.start };
    drawOverlay();
  }

  function handlePointerUp() {
    const draft = draftRef.current;
    draftRef.current = null;
    if (!draft) return;
    const { start: _start, ...shape } = draft;
    // Ignore accidental clicks that would make a 0-size box.
    const minSize = 4 / scale;
    if (shape.type === 'brush' || (shape.w >= minSize && shape.h >= minSize)) {
      setShapes((prev) => [...prev, shape]);
    } else {
      drawOverlay();
    }
  }

  async function handleDownload() {
    setIsExporting(true);
    setError('');
    try {
      const canvas = renderRedacted(image.img, shapes, settings, 1);
      // JPG can't store transparency; give see-through PNGs a white base.
      let source = canvas;
      if (format === 'image/jpeg') {
        source = document.createElement('canvas');
        source.width = canvas.width;
        source.height = canvas.height;
        const ctx = source.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, source.width, source.height);
        ctx.drawImage(canvas, 0, 0);
      }
      const blob = await canvasToBlob(source, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = redactedName(image.file.name, FORMAT_BY_MIME[format].extension);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch (exportError) {
      setError(exportError.message || 'Could not create the image.');
    } finally {
      setIsExporting(false);
    }
  }

  const update = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="blur-pixelate">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {confirm && (
        <ConfirmDialog
          title={confirm === 'clear' ? 'Remove all areas?' : 'Open a different image?'}
          message={
            confirm === 'clear'
              ? 'This removes every blurred or pixelated area you added.'
              : "You haven't downloaded this redacted image yet. Opening another one discards your areas."
          }
          confirmLabel={confirm === 'clear' ? 'Remove all' : 'Open image'}
          onCancel={() => {
            setConfirm(null);
            setPendingFile(null);
          }}
          onConfirm={() => {
            if (confirm === 'clear') setShapes([]);
            else loadFile(pendingFile);
            setConfirm(null);
            setPendingFile(null);
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="visually-hidden"
        aria-label="Choose an image"
        onChange={(event) => {
          requestFile(event.target.files[0]);
          event.target.value = '';
        }}
      />

      {!image && (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, paste, or click to choose an image"
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
            requestFile(event.dataTransfer.files[0]);
          }}
        >
          <p className="drop-zone-title">Drag &amp; drop, paste, or click to choose an image</p>
          <p className="drop-zone-hint">Then drag over faces, plates or text to hide them</p>
        </div>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {image && (
        <div className="filters-layout">
          <div className="filters-preview">
            <div className="redact-stage">
              {/* The frame is exactly the image's size, so the drawing
                  layer on top lines up with it pixel for pixel. */}
              <div className="redact-frame">
                <canvas ref={previewRef} className="redact-canvas" />
                <canvas
                  ref={overlayRef}
                  className={`redact-overlay redact-tool-${tool}`}
                  aria-label="Image. Drag across an area to blur, pixelate or black it out."
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
              </div>
            </div>
            <div className="converter-toolbar json-toolbar">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShapes((prev) => prev.slice(0, -1))}
                disabled={!shapes.length}
                title="Undo (Ctrl+Z)"
              >
                &#8630; Undo
              </button>
              <button type="button" className="ghost-button" onClick={() => setConfirm('clear')} disabled={!shapes.length}>
                Remove all areas
              </button>
              <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
                Choose a different image
              </button>
              <span className="field-hint">
                {shapes.length} area{shapes.length === 1 ? '' : 's'} · {image.img.naturalWidth}&times;{image.img.naturalHeight} ·{' '}
                {formatBytes(image.file.size)}
              </span>
            </div>
          </div>

          <div className="filters-controls">
            <div className="field">
              <span className="filters-label">Draw with</span>
              <div className="mode-toggle" role="radiogroup" aria-label="Drawing tool">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tool === t.id}
                    className={tool === t.id ? 'mode-button active' : 'mode-button'}
                    onClick={() => setTool(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {tool === 'brush' && (
              <div className="field">
                <label htmlFor="redact-brush">Brush size</label>
                <input id="redact-brush" type="range" min="1" max="15" step="0.5" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
              </div>
            )}

            <div className="field">
              <span className="filters-label">Effect</span>
              <div className="mode-toggle" role="radiogroup" aria-label="Effect">
                {EFFECTS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={settings.effect === e.id}
                    className={settings.effect === e.id ? 'mode-button active' : 'mode-button'}
                    onClick={() => update('effect', e.id)}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            {settings.effect === 'solid' ? (
              <div className="field">
                <label htmlFor="redact-color">Box color</label>
                <input id="redact-color" type="color" className="color-picker" value={settings.color} onChange={(event) => update('color', event.target.value)} />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="redact-strength">Strength: {settings.strength}</label>
                <input
                  id="redact-strength"
                  type="range"
                  min="5"
                  max="100"
                  value={settings.strength}
                  onChange={(event) => update('strength', Number(event.target.value))}
                />
              </div>
            )}
            {settings.effect !== 'solid' && (
              <p className="field-hint">
                For text such as names, numbers or passwords, use a <strong>Solid box</strong> - light blur can sometimes be reversed.
              </p>
            )}

            <label className="checkbox-field">
              <input type="checkbox" checked={showOutlines} onChange={(event) => setShowOutlines(event.target.checked)} />
              Show area outlines (not saved in the image)
            </label>

            <div className="field">
              <label htmlFor="redact-format">Save as</label>
              <select id="redact-format" value={format} onChange={(event) => setFormat(event.target.value)}>
                {FORMATS.map((f) => (
                  <option key={f.mime} value={f.mime}>{f.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg redact-download"
              onClick={handleDownload}
              disabled={!shapes.length || isExporting}
            >
              {isExporting ? 'Creating image…' : 'Download image'}
            </button>
            {!shapes.length && <p className="field-hint">Drag across the image to add an area first.</p>}
            {downloaded && <p className="field-hint">Downloaded at full resolution, without the photo&apos;s hidden metadata.</p>}
          </div>
        </div>
      )}

      <article className="tool-article">
        <p>
          Hide faces, license plates, addresses, names and other private details in a photo or
          screenshot before you share it. Drag over each area to pixelate it, blur it, or cover it
          with a solid box, then download the full-resolution result. The image is edited in your
          browser and never uploaded - which is exactly what you want for something private.
        </p>

        <h2>How to blur or pixelate part of an image</h2>
        <ol>
          <li>Drop, paste or choose a PNG, JPG or WebP image. Screenshots paste straight in with Ctrl+V.</li>
          <li>Pick Rectangle, Ellipse (good for faces) or Brush, then drag over each area to hide.</li>
          <li>Choose Pixelate, Blur or Solid box and adjust the strength. Every area updates together.</li>
          <li>Press <strong>Download image</strong>. Undo with the button or Ctrl+Z.</li>
        </ol>

        <h2>Which effect is safest?</h2>
        <ul>
          <li><strong>Solid box</strong> replaces the pixels completely, so nothing can be recovered. Use it for text: names, card numbers, passwords, addresses and email addresses.</li>
          <li><strong>Pixelate</strong> at a high strength is a good choice for faces and license plates. Small blocks over short text can sometimes be reversed by guessing, so turn the strength up.</li>
          <li><strong>Blur</strong> looks the softest and suits backgrounds and bystanders. Strong blur is needed to make faces unrecognisable.</li>
        </ul>

        <h2>Privacy beyond what you can see</h2>
        <p>
          Photos often carry hidden metadata such as the GPS location where they were taken and
          the camera used. The downloaded image is created fresh from the pixels, so that metadata
          is not included. To check what a photo contains, use the{' '}
          <Link to="/tool/exif-remover">EXIF Viewer &amp; Remover</Link>.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my image uploaded?</h3>
          <p>No - everything happens on your device. Nothing is sent to a server.</p>
        </div>
        <div className="faq-item">
          <h3>Does it lower the image quality?</h3>
          <p>Only the areas you choose change. The rest of the image is saved at its full original resolution; JPG and WebP are saved at high quality, PNG without any loss.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Remove an unwanted object instead with the <Link to="/tool/watermark-remover">Watermark Remover</Link>,
          add your own mark with <Link to="/tool/add-watermark">Add Watermark to Image</Link>, or browse
          all <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
