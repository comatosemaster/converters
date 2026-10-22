import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { validateImageFile } from '../image-color-picker/imageColorPickerUtils.js';
import {
  DEFAULT_COLORS,
  EXPORT_FORMATS,
  MAX_COLORS,
  MIN_COLORS,
  SAMPLE_SIZE,
  SORTS,
  exportPalette,
  extractPalette,
  sortPalette,
} from './paletteUtils.js';

const EXPORT_FILES = {
  css: ['css', 'text/css'],
  scss: ['scss', 'text/x-scss'],
  tailwind: ['js', 'text/javascript'],
  json: ['json', 'application/json'],
  list: ['txt', 'text/plain'],
};

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A shareable picture of the palette: one column per color, its hex code
// written in black or white, whichever reads better on it.
function renderPalettePng(palette) {
  const width = 1200;
  const height = 400;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const columnWidth = width / palette.length;
  palette.forEach((color, i) => {
    const x = Math.round(i * columnWidth);
    ctx.fillStyle = color.hex;
    ctx.fillRect(x, 0, Math.round((i + 1) * columnWidth) - x, height);
    ctx.fillStyle = color.textColor;
    ctx.font = `600 ${Math.min(28, columnWidth / 5)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(color.hex.toUpperCase(), x + columnWidth / 2, height - 32);
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The image is drawn once onto a small canvas (SAMPLE_SIZE px on its long
// side) and its pixels kept; changing the number of colors just re-runs
// the clustering in paletteUtils.js on those pixels. File checks reuse the
// Image Color Picker's validateImageFile().

export default function ImagePaletteExtractor() {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [pixels, setPixels] = useState(null);
  const [count, setCount] = useState(DEFAULT_COLORS);
  const [sort, setSort] = useState('share');
  const [format, setFormat] = useState('css');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  // The palette (as text) when it was last copied or downloaded.
  const [savedPalette, setSavedPalette] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const palette = useMemo(
    () => (pixels ? sortPalette(extractPalette(pixels, count), sort) : []),
    [pixels, count, sort],
  );
  const paletteKey = palette.map((c) => c.hex).join(',');
  const hasUnsavedWork = Boolean(file) && paletteKey !== '' && paletteKey !== savedPalette;
  useUnsavedChangesWarning(hasUnsavedWork);

  useEffect(() => {
    if (!file) {
      setImageUrl('');
      setPixels(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, SAMPLE_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      setPixels(ctx.getImageData(0, 0, width, height).data);
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

  function openFile(nextFile) {
    setError('');
    setPixels(null);
    setSavedPalette('');
    setFile(nextFile);
  }

  const handleFile = useCallback(
    (selected) => {
      if (!selected) return;
      const validation = validateImageFile(selected);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
      if (hasUnsavedWork) setPendingFile(selected);
      else openFile(selected);
    },
    [hasUnsavedWork],
  );

  usePasteToUpload(true, handleFile);

  async function copy(id, text) {
    await navigator.clipboard.writeText(text);
    setSavedPalette(paletteKey);
    setCopied(id);
    setTimeout(() => setCopied(''), 1500);
  }

  const baseName = file ? file.name.replace(/\.[^.]+$/, '') || 'image' : 'image';
  const exportText = exportPalette(palette, format);

  function downloadExport() {
    const [extension, type] = EXPORT_FILES[format];
    downloadBlob(new Blob([exportText], { type }), `${baseName}-palette.${extension}`);
    setSavedPalette(paletteKey);
  }

  async function downloadPng() {
    const blob = await renderPalettePng(palette);
    if (blob) downloadBlob(blob, `${baseName}-palette.png`);
    setSavedPalette(paletteKey);
  }

  const dropProps = {
    onDragOver: (event) => {
      event.preventDefault();
      setIsDragging(true);
    },
    onDragLeave: () => setIsDragging(false),
    onDrop: (event) => {
      event.preventDefault();
      setIsDragging(false);
      handleFile(event.dataTransfer.files[0]);
    },
  };

  return (
    <div className="image-palette-extractor">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {pendingFile && (
        <ConfirmDialog
          title="Open a different image?"
          message="You haven't copied or downloaded this palette yet. Opening another image will replace it."
          confirmLabel="Open image"
          onCancel={() => setPendingFile(null)}
          onConfirm={() => {
            openFile(pendingFile);
            setPendingFile(null);
          }}
        />
      )}
      {showClearConfirm && (
        <ConfirmDialog
          title="Remove this image?"
          message="This clears the image and its palette."
          confirmLabel="Remove"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            setShowClearConfirm(false);
            setFile(null);
            setSavedPalette('');
          }}
        />
      )}

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

      {!file ? (
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
          {...dropProps}
        >
          <p className="drop-zone-title">Drag &amp; drop, paste, or click to choose an image</p>
          <p className="drop-zone-hint">PNG, JPG or WebP - the palette appears instantly</p>
        </div>
      ) : (
        <>
          <div className="converter-toolbar json-toolbar">
            <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
              Choose a different image
            </button>
            <button type="button" className="ghost-button" onClick={() => setShowClearConfirm(true)}>
              Clear
            </button>
          </div>

          <div className="palette-layout">
            <div className={isDragging ? 'palette-image dragging' : 'palette-image'} {...dropProps}>
              {imageUrl && <img src={imageUrl} alt="Your uploaded image" />}
              {palette.length > 0 && (
                <div className="palette-bar" aria-hidden="true">
                  {palette.map((color, i) => (
                    <span key={`${color.hex}-${i}`} style={{ backgroundColor: color.hex, flexGrow: color.share }} />
                  ))}
                </div>
              )}
            </div>

            <div className="palette-controls">
              <div className="json-options-row">
                <div className="field palette-count">
                  <label htmlFor="palette-count">Colors: {count}</label>
                  <input
                    id="palette-count"
                    type="range"
                    min={MIN_COLORS}
                    max={MAX_COLORS}
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="palette-sort">Order</label>
                  <select id="palette-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
                    {SORTS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {error && <p className="field-error">{error}</p>}
              {!pixels && !error && <p className="field-hint">Reading the image…</p>}
              {pixels && palette.length === 0 && (
                <p className="field-warning">This image is fully transparent, so there are no colors to extract.</p>
              )}
              {palette.length > 0 && palette.length < count && (
                <p className="field-hint">
                  This image only has {palette.length} clearly different colors - similar shades were merged.
                </p>
              )}

              <ul className="palette-swatches">
                {palette.map((color, i) => (
                  <li key={`${color.hex}-${i}`}>
                    <button
                      type="button"
                      className="palette-swatch"
                      style={{ backgroundColor: color.hex, color: color.textColor }}
                      onClick={() => copy(color.hex, color.hex)}
                      title={`Copy ${color.hex}`}
                    >
                      <span className="palette-swatch-hex">{copied === color.hex ? 'Copied!' : color.hex.toUpperCase()}</span>
                      <span className="palette-swatch-share">{(color.share * 100).toFixed(1)}%</span>
                    </button>
                    <span className="palette-swatch-meta">
                      {color.rgbText}
                      <br />
                      {color.hslText}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {palette.length > 0 && (
            <div className="field">
              <div className="field-header">
                <div className="mode-toggle palette-formats" role="radiogroup" aria-label="Export format">
                  {EXPORT_FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={format === f.id}
                      className={format === f.id ? 'mode-button active' : 'mode-button'}
                      onClick={() => setFormat(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="palette-actions">
                  <button type="button" className="copy-button" onClick={() => copy('export', exportText)}>
                    {copied === 'export' ? 'Copied!' : 'Copy'}
                  </button>
                  <button type="button" className="ghost-button" onClick={downloadExport}>
                    Download .{EXPORT_FILES[format][0]}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={downloadPng}>
                    Download PNG
                  </button>
                </div>
              </div>
              <pre className="gradient-css-block">
                <code>{exportText}</code>
              </pre>
            </div>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          The palette extractor finds the main colors in any image - a photo, a logo, a
          screenshot or a painting - and gives you their HEX, RGB and HSL codes, ready to copy as
          CSS variables, SCSS, Tailwind or JSON. Use it to build a website color scheme from a
          brand photo or match a design to an illustration. The image never leaves your browser.
        </p>

        <h2>How to extract a color palette</h2>
        <ol>
          <li>Drop, paste or choose a PNG, JPG or WebP image.</li>
          <li>Pick how many colors you want, from 2 to 12. The palette updates instantly.</li>
          <li>Click any swatch to copy its HEX code, or copy and download the whole palette in the format you need - including a PNG image of the swatches to share.</li>
        </ol>

        <h2>How the colors are chosen</h2>
        <p>
          The tool groups every pixel into clusters of similar color using the k-means
          algorithm, and each swatch is the average color of one cluster. The grouping works in the
          CIELAB color space, which measures color difference the way people perceive it, so the
          palette reflects the colors you actually notice rather than tiny shifts in dark shadows.
          The percentage under each swatch shows how much of the image it covers. Fully
          transparent areas are ignored.
        </p>
        <p>
          The result is the same every time you open the same image. If you ask for more colors
          than the image really contains, near-identical shades are merged instead of being shown
          as duplicates.
        </p>

        <h2>Using the palette in a design</h2>
        <ul>
          <li>Use the most common colors for large areas like backgrounds, and the rarer, more saturated ones as accents for buttons and links.</li>
          <li>Each swatch shows its code in black or white, whichever contrasts better - a quick hint for which text color works on it.</li>
          <li>Check that text and background pairs are readable with the <Link to="/tool/color-contrast-checker">Color Contrast Checker</Link>.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my image uploaded?</h3>
          <p>No - the image is analysed inside your browser with the Canvas API. Nothing is sent to a server.</p>
        </div>
        <div className="faq-item">
          <h3>Why don&apos;t I see a color that&apos;s in the image?</h3>
          <p>Small details don&apos;t cover enough of the image to get their own cluster. Increase the number of colors, or crop the image to the part you care about first with the <Link to="/tool/image-resizer">Image Resizer &amp; Cropper</Link>.</p>
        </div>
        <div className="faq-item">
          <h3>How is this different from the Image Color Picker?</h3>
          <p>The <Link to="/tool/image-color-picker">Image Color Picker</Link> gives you the exact color of one pixel you click on. This tool summarises the whole image into its main colors automatically.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Convert colors between formats with the <Link to="/tool/color-converter">Color Converter</Link>,
          build a gradient from your palette with the{' '}
          <Link to="/tool/css-gradient-generator">CSS Gradient Generator</Link>, or browse all{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
