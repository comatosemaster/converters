import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import {
  FORMATS,
  MAX_FILE_SIZE,
  MAX_OUTPUT_SIDE,
  SCALES,
  inspectSvg,
  outputName,
  outputSize,
  rasterize,
} from './svgUtils.js';

let nextId = 1;

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// Parsing, sizing and drawing live in svgUtils.js. The thumbnail strip
// reuses the Add Watermark tool's styles.

export default function SvgToPng() {
  const fileInputRef = useRef(null);

  const [items, setItems] = useState([]); // { id, name, info, url }
  const [selectedId, setSelectedId] = useState(null);
  const [code, setCode] = useState('');
  const [sizing, setSizing] = useState({ mode: 'scale', value: 2 });
  const [mime, setMime] = useState('image/png');
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState('#ffffff');
  const [errors, setErrors] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(null); // { done, total } while exporting
  const [downloaded, setDownloaded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const format = FORMATS.find((f) => f.mime === mime);
  const fill = format.transparent && transparent ? null : background;
  const selected = items.find((i) => i.id === selectedId) ?? items[0];
  const size = selected ? outputSize(selected.info, sizing) : null;

  // Free preview URLs when leaving the page.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  // Any change means the last download no longer matches what's shown.
  useEffect(() => setDownloaded(false), [items, sizing, mime, transparent, background]);

  const hasUnsavedWork = (items.length > 0 && !downloaded) || code.trim() !== '';
  useUnsavedChangesWarning(hasUnsavedWork);

  function addSvgs(entries) {
    const added = [];
    const problems = [];
    entries.forEach(({ name, text }) => {
      const info = inspectSvg(text);
      if (!info.ok) {
        problems.push(`${name}: ${info.error}`);
        return;
      }
      const url = URL.createObjectURL(new Blob([info.source], { type: 'image/svg+xml' }));
      added.push({ id: nextId++, name, info, url });
    });
    if (added.length) {
      setItems((prev) => [...prev, ...added]);
      setSelectedId(added[0].id);
    }
    setErrors(problems);
    return added.length > 0;
  }

  async function addFiles(fileList) {
    const entries = [];
    const problems = [];
    for (const file of Array.from(fileList ?? [])) {
      if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
        problems.push(`${file.name}: not an SVG file.`);
      } else if (file.size > MAX_FILE_SIZE) {
        problems.push(`${file.name}: larger than ${formatBytes(MAX_FILE_SIZE)}.`);
      } else {
        entries.push({ name: file.name, text: await file.text() });
      }
    }
    addSvgs(entries);
    if (problems.length) setErrors((prev) => [...prev, ...problems]);
  }

  function addCode() {
    if (addSvgs([{ name: `pasted-${items.length + 1}.svg`, text: code }])) setCode('');
  }

  function removeItem(id) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function handleConvert() {
    setErrors([]);
    setBusy({ done: 0, total: items.length });
    try {
      const settings = { mime, background: fill };
      if (items.length === 1) {
        const item = items[0];
        const blob = await rasterize(item.info, { ...settings, ...outputSize(item.info, sizing) });
        downloadBlob(blob, outputName(item.name, format.extension));
      } else {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        const used = new Set();
        for (let i = 0; i < items.length; i += 1) {
          const item = items[i];
          const blob = await rasterize(item.info, { ...settings, ...outputSize(item.info, sizing) });
          let name = outputName(item.name, format.extension);
          for (let n = 2; used.has(name); n += 1) name = outputName(`${item.name.replace(/\.svg$/i, '')}-${n}`, format.extension);
          used.add(name);
          zip.file(name, blob);
          setBusy({ done: i + 1, total: items.length });
        }
        downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `svg-to-${format.extension}.zip`);
      }
      setDownloaded(true);
    } catch (error) {
      setErrors([error.message || 'Something went wrong converting the SVG.']);
    } finally {
      setBusy(null);
    }
  }

  const sizingMax = sizing.mode === 'scale' ? 16 : MAX_OUTPUT_SIDE;

  return (
    <div className="svg-to-png">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {showClearConfirm && (
        <ConfirmDialog
          title="Remove all SVGs?"
          message="You haven't downloaded the converted images yet. Clearing removes the SVGs from the list."
          confirmLabel="Remove all"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            setShowClearConfirm(false);
            items.forEach((i) => URL.revokeObjectURL(i.url));
            setItems([]);
            setErrors([]);
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        className="visually-hidden"
        aria-label="Choose SVG files"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {items.length === 0 && (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop or click to choose SVG files"
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
          <p className="drop-zone-title">Drag &amp; drop SVG files, or click to browse</p>
          <p className="drop-zone-hint">One icon or a whole set - they convert together</p>
        </div>
      )}

      <div className="field svg-code-field">
        <label htmlFor="svg-code">Or paste SVG code</label>
        <textarea
          id="svg-code"
          rows={items.length ? 3 : 5}
          value={code}
          spellCheck={false}
          placeholder={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">…</svg>'}
          onChange={(event) => setCode(event.target.value)}
        />
        <div className="converter-toolbar">
          <button type="button" className="ghost-button" onClick={addCode} disabled={!code.trim()}>
            Add this SVG
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="field-error" role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {selected && (
        <div className="filters-layout">
          <div className="filters-preview">
            <div
              className={fill ? 'svg-preview-frame' : 'svg-preview-frame color-preview-frame'}
              style={fill ? { backgroundColor: fill } : undefined}
            >
              <img src={selected.url} alt={`Preview of ${selected.name}`} />
            </div>
            {items.length > 1 && (
              <ul className="watermark-thumbs" aria-label="SVGs to convert">
                {items.map((item) => (
                  <li key={item.id} className={item.id === selected.id ? 'active' : ''}>
                    <button type="button" onClick={() => setSelectedId(item.id)} aria-label={`Preview ${item.name}`}>
                      <img src={item.url} alt="" />
                    </button>
                    <button type="button" className="watermark-thumb-remove" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.name}`}>
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="converter-toolbar json-toolbar">
              <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
                + Add SVGs
              </button>
              <button type="button" className="ghost-button" onClick={() => setShowClearConfirm(true)}>
                Clear
              </button>
              <span className="field-hint">
                {selected.name} · {Math.round(selected.info.width)}&times;{Math.round(selected.info.height)} px
              </span>
            </div>
            {selected.info.warnings.map((w) => (
              <p key={w} className="field-warning">{w}</p>
            ))}
          </div>

          <div className="filters-controls">
            <div className="field">
              <span className="filters-label">Format</span>
              <div className="mode-toggle" role="radiogroup" aria-label="Output format">
                {FORMATS.map((f) => (
                  <button
                    key={f.mime}
                    type="button"
                    role="radio"
                    aria-checked={mime === f.mime}
                    className={mime === f.mime ? 'mode-button active' : 'mode-button'}
                    onClick={() => setMime(f.mime)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="unit-converter-row">
              <div className="field">
                <label htmlFor="svg-size-mode">Size</label>
                <select
                  id="svg-size-mode"
                  value={sizing.mode}
                  onChange={(event) => {
                    const mode = event.target.value;
                    const value = mode === 'scale' ? 2 : mode === 'width' ? size.width : size.height;
                    setSizing({ mode, value });
                  }}
                >
                  <option value="scale">Scale</option>
                  <option value="width">Width in pixels</option>
                  <option value="height">Height in pixels</option>
                </select>
              </div>
              {sizing.mode === 'scale' ? (
                <div className="field">
                  <label htmlFor="svg-scale">Scale</label>
                  <select
                    id="svg-scale"
                    value={sizing.value}
                    onChange={(event) => setSizing({ mode: 'scale', value: Number(event.target.value) })}
                  >
                    {SCALES.map((s) => (
                      <option key={s} value={s}>{s}&times;</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="svg-pixels">{sizing.mode === 'width' ? 'Width' : 'Height'} (px)</label>
                  <input
                    id="svg-pixels"
                    type="number"
                    min={1}
                    max={sizingMax}
                    value={sizing.value}
                    onChange={(event) =>
                      setSizing({ mode: sizing.mode, value: Math.min(sizingMax, Math.max(1, Number(event.target.value) || 1)) })
                    }
                  />
                </div>
              )}
            </div>
            <p className="field-hint">
              Output: <strong>{size.width.toLocaleString()} &times; {size.height.toLocaleString()} px</strong>
              {items.length > 1 ? ' for this SVG; each keeps its own proportions' : ''}
              {size.clamped ? ` (limited to ${MAX_OUTPUT_SIDE.toLocaleString()} px)` : ''}
            </p>

            {format.transparent && (
              <label className="checkbox-field">
                <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />
                Transparent background
              </label>
            )}
            {fill && (
              <div className="field">
                <label htmlFor="svg-background">Background color{format.transparent ? '' : ' (JPG has no transparency)'}</label>
                <input
                  id="svg-background"
                  type="color"
                  className="color-picker"
                  value={background}
                  onChange={(event) => setBackground(event.target.value)}
                />
              </div>
            )}

            <button type="button" className="btn btn-primary btn-lg svg-convert" onClick={handleConvert} disabled={Boolean(busy)}>
              {busy
                ? `Converting ${busy.done}/${busy.total}…`
                : items.length > 1
                  ? `Convert ${items.length} SVGs & download ZIP`
                  : `Convert & download ${format.label}`}
            </button>
            {downloaded && <p className="field-hint">Downloaded. Change any setting to convert again.</p>}
          </div>
        </div>
      )}

      <article className="tool-article">
        <p>
          This converter turns SVG vector graphics into PNG, JPG or WebP images at any size. Logos,
          icons and illustrations are drawn fresh at the resolution you choose, so a 2x or 4x export
          is perfectly sharp instead of a blurry enlargement. Convert one file or a whole icon set
          at once - everything happens in your browser.
        </p>

        <h2>How to convert SVG to PNG</h2>
        <ol>
          <li>Drop one or more .svg files, or paste SVG code and press <strong>Add this SVG</strong>.</li>
          <li>Choose PNG, JPG or WebP and the size - a scale such as 2&times;, or an exact width or height in pixels.</li>
          <li>Keep the background transparent or pick a color, then press <strong>Convert &amp; download</strong>. Several files download together as a ZIP.</li>
        </ol>

        <h2>Why convert an SVG at all?</h2>
        <p>
          SVG is ideal on the web because it scales to any size, but many places still need a
          regular image: email signatures, Word and PowerPoint documents, social media uploads,
          app store listings, favicons for older systems and many online forms only accept PNG or
          JPG. Converting at 2&times; or 3&times; the display size keeps the result crisp on high-resolution
          phone and laptop screens.
        </p>

        <h2>PNG, JPG or WebP?</h2>
        <ul>
          <li><strong>PNG</strong> keeps sharp edges and transparency - the best choice for logos and icons.</li>
          <li><strong>JPG</strong> has no transparency, so a background color is filled in. Good for illustrations with gradients going into documents or emails.</li>
          <li><strong>WebP</strong> keeps transparency in a smaller file, for use on websites.</li>
        </ul>

        <h2>SVGs that need a little help</h2>
        <p>
          SVG code copied from a web page often lacks the <code>xmlns</code> declaration a
          standalone file needs; the converter adds it automatically. An SVG with only a{' '}
          <code>viewBox</code> and no width or height gets its size from the viewBox. Images and fonts
          linked from other websites can&apos;t be loaded during conversion, and text is drawn with the
          fonts installed on your device - the tool warns you when either applies.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Are my files uploaded?</h3>
          <p>No - the SVG is drawn by your own browser and saved straight to your device. Scripts inside an SVG are never run.</p>
        </div>
        <div className="faq-item">
          <h3>What is the largest size I can export?</h3>
          <p>Up to {MAX_OUTPUT_SIDE.toLocaleString()} pixels on the longest side, which is more than enough for print-quality logos. Larger sizes are scaled down to fit.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Make a favicon set from the result with the <Link to="/tool/favicon-generator">Favicon Generator</Link>,
          shrink it with the <Link to="/tool/image-compressor">Image Compressor</Link>, or browse all{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
