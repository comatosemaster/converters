import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { parseColor, rgbToHex } from '../color-converter/colorConversions.js';
import {
  MAX_LAYERS,
  PRESETS,
  RANGES,
  createDefaultDesign,
  createLayer,
  cssDeclaration,
  designFromPreset,
  designSignature,
  layerToCss,
  shadowValue,
  tailwindClass,
} from './boxShadowUtils.js';

const SLIDERS = [
  { key: 'x', label: 'Horizontal offset' },
  { key: 'y', label: 'Vertical offset' },
  { key: 'blur', label: 'Blur' },
  { key: 'spread', label: 'Spread' },
];

const clamp = (n, { min, max }) => Math.min(max, Math.max(min, n));

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The CSS text and presets live in boxShadowUtils.js; this file is the
// editor around them. Same family (and same CSS output block) as the CSS
// Gradient Generator.

export default function BoxShadowGenerator() {
  const [defaultSignature] = useState(() => designSignature(createDefaultDesign()));
  const [design, setDesign] = useState(createDefaultDesign);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState('');
  // Signature of the design when last copied - changes after that are
  // unsaved work again.
  const [savedSignature, setSavedSignature] = useState(defaultSignature);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const signature = designSignature(design);
  const hasUnsavedWork = signature !== defaultSignature && signature !== savedSignature;
  useUnsavedChangesWarning(hasUnsavedWork);

  const index = Math.min(activeIndex, design.layers.length - 1);
  const layer = design.layers[index];
  const css = cssDeclaration(design);
  const tailwind = tailwindClass(design.layers);

  function update(patch) {
    setDesign((prev) => ({ ...prev, ...patch }));
  }

  function updateLayer(patch) {
    setDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }));
  }

  function addLayer() {
    // A copy of the current layer, pushed a little further out - a quick
    // start for the common "two soft layers" look.
    setDesign((prev) => {
      const { id: _id, ...base } = prev.layers[index] ?? createLayer();
      const copy = createLayer({ ...base, y: Math.min(base.y * 2, 100), blur: Math.min(base.blur * 2, 150) });
      return { ...prev, layers: [...prev.layers, copy] };
    });
    setActiveIndex(design.layers.length);
  }

  function removeLayer(i) {
    setDesign((prev) => ({ ...prev, layers: prev.layers.filter((_, j) => j !== i) }));
    setActiveIndex((current) => Math.max(0, current > i ? current - 1 : Math.min(current, design.layers.length - 2)));
  }

  function applyPreset(preset) {
    setDesign(designFromPreset(preset));
    setActiveIndex(0);
  }

  async function copy(id, text) {
    await navigator.clipboard.writeText(text);
    setSavedSignature(signature);
    setCopied(id);
    setTimeout(() => setCopied(''), 1500);
  }

  return (
    <div className="box-shadow-generator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset the shadow?"
          message="This discards your layers and settings and starts again from the default shadow."
          confirmLabel="Reset"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => {
            setShowResetConfirm(false);
            setDesign(createDefaultDesign());
            setActiveIndex(0);
          }}
        />
      )}

      <div className="shadow-layout">
        <div className="shadow-stage" style={{ backgroundColor: design.canvasColor }}>
          <div
            className="shadow-box"
            role="img"
            aria-label="Shadow preview"
            style={{
              backgroundColor: design.boxColor,
              borderRadius: `${design.radius}px`,
              boxShadow: shadowValue(design.layers),
            }}
          />
        </div>

        <div className="shadow-controls">
          <div className="field">
            <div className="field-header">
              <label>Layers</label>
              <button
                type="button"
                className="ghost-button"
                onClick={addLayer}
                disabled={design.layers.length >= MAX_LAYERS}
              >
                + Add layer
              </button>
            </div>
            {design.layers.length === 0 ? (
              <p className="field-hint">No shadow. Add a layer to start.</p>
            ) : (
              <ul className="shadow-layers">
                {design.layers.map((l, i) => (
                  <li key={l.id} className={i === index ? 'active' : ''}>
                    <button
                      type="button"
                      className="shadow-layer-select"
                      aria-pressed={i === index}
                      onClick={() => setActiveIndex(i)}
                    >
                      <span className="shadow-layer-swatch" style={{ backgroundColor: rgbToHex(l.color), opacity: Math.max(0.25, l.color.a) }} />
                      <span className="shadow-layer-name">Layer {i + 1}</span>
                      <code>{layerToCss(l)}</code>
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeLayer(i)}
                      aria-label={`Remove layer ${i + 1}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {layer && (
            <fieldset className="shadow-layer-editor">
              <legend>Layer {index + 1}</legend>
              {SLIDERS.map(({ key, label }) => (
                <div className="field" key={key}>
                  <label htmlFor={`shadow-${key}`}>{label}</label>
                  <div className="gradient-angle-row">
                    <input
                      id={`shadow-${key}`}
                      type="range"
                      min={RANGES[key].min}
                      max={RANGES[key].max}
                      value={layer[key]}
                      onChange={(event) => updateLayer({ [key]: Number(event.target.value) })}
                    />
                    <input
                      type="number"
                      className="gradient-angle-number"
                      min={RANGES[key].min}
                      max={RANGES[key].max}
                      value={layer[key]}
                      onChange={(event) => updateLayer({ [key]: clamp(Number(event.target.value) || 0, RANGES[key]) })}
                      aria-label={`${label} in pixels`}
                    />
                  </div>
                </div>
              ))}
              <div className="shadow-color-row">
                <input
                  type="color"
                  className="color-picker"
                  value={rgbToHex(layer.color)}
                  onChange={(event) => updateLayer({ color: { ...parseColor(event.target.value).rgba, a: layer.color.a } })}
                  aria-label="Shadow color"
                />
                <div className="field">
                  <label htmlFor="shadow-opacity">Opacity: {Math.round(layer.color.a * 100)}%</label>
                  <input
                    id="shadow-opacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={layer.color.a}
                    onChange={(event) => updateLayer({ color: { ...layer.color, a: Number(event.target.value) } })}
                  />
                </div>
              </div>
              <label className="checkbox-field">
                <input type="checkbox" checked={layer.inset} onChange={(event) => updateLayer({ inset: event.target.checked })} />
                Inner shadow (inset)
              </label>
            </fieldset>
          )}

          <div className="shadow-surface-row">
            <div className="field">
              <label htmlFor="shadow-radius">Corner radius: {design.radius}px</label>
              <input
                id="shadow-radius"
                type="range"
                min="0"
                max="100"
                value={design.radius}
                onChange={(event) => update({ radius: Number(event.target.value) })}
              />
            </div>
            <div className="field shadow-surface-color">
              <label htmlFor="shadow-box-color">Box</label>
              <input
                id="shadow-box-color"
                type="color"
                className="color-picker"
                value={design.boxColor}
                onChange={(event) => update({ boxColor: event.target.value })}
              />
            </div>
            <div className="field shadow-surface-color">
              <label htmlFor="shadow-canvas-color">Background</label>
              <input
                id="shadow-canvas-color"
                type="color"
                className="color-picker"
                value={design.canvasColor}
                onChange={(event) => update({ canvasColor: event.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label>Presets</label>
        </div>
        <div className="shadow-presets">
          {PRESETS.map((preset) => {
            const preview = designFromPreset(preset);
            return (
              <button
                key={preset.id}
                type="button"
                className="shadow-preset"
                style={{ backgroundColor: preview.canvasColor }}
                onClick={() => applyPreset(preset)}
              >
                <span
                  className="shadow-preset-box"
                  style={{
                    backgroundColor: preview.boxColor,
                    borderRadius: `${Math.min(preview.radius, 14)}px`,
                    boxShadow: shadowValue(preview.layers),
                  }}
                />
                <span className="shadow-preset-name">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label>CSS</label>
          <div className="shadow-actions">
            <button type="button" className="copy-button" onClick={() => copy('css', css)}>
              {copied === 'css' ? 'Copied!' : 'Copy CSS'}
            </button>
            <button type="button" className="ghost-button" onClick={() => copy('tw', tailwind)} disabled={!design.layers.length}>
              {copied === 'tw' ? 'Copied!' : 'Copy Tailwind class'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowResetConfirm(true)}
              disabled={signature === defaultSignature}
            >
              Reset
            </button>
          </div>
        </div>
        <pre className="gradient-css-block">
          <code>{css}</code>
        </pre>
      </div>

      <article className="tool-article">
        <p>
          This box shadow generator lets you design CSS shadows visually - from a barely-there
          card edge to soft layered depth, glows, neumorphism and inner shadows - and copy the
          code. Stack several layers, tune each one with sliders, and see the result live on your
          own colors. It runs entirely in your browser.
        </p>

        <h2>How box-shadow works</h2>
        <p>
          Each shadow is written as <code>offset-x offset-y blur spread color</code>, for example{' '}
          <code>0 8px 24px -4px rgba(0, 0, 0, 0.18)</code>:
        </p>
        <ul>
          <li><strong>Offsets</strong> move the shadow right/down (negative values go left/up), as if a light shone from the opposite side.</li>
          <li><strong>Blur</strong> softens the edge - 0 gives a hard, cut-out shadow.</li>
          <li><strong>Spread</strong> grows or shrinks the shadow before blurring. A negative spread with a larger blur gives the soft, lifted look used by most modern card designs.</li>
          <li><strong>inset</strong> draws the shadow inside the element, which makes it look pressed in.</li>
        </ul>

        <h2>Why layer shadows?</h2>
        <p>
          Real shadows are sharp and dark close to an object and soft and faint further away. A
          single CSS shadow can only be one of those, so designers stack several - each with
          double the offset and blur of the one before. The <strong>Layered smooth</strong> preset
          shows the technique. Layers are separated by commas, and the first one is drawn on top.
        </p>

        <h2>Neumorphism and glows</h2>
        <p>
          Neumorphism pairs a dark shadow on one side with a light one on the other, on a box the
          same color as the page, so the shape seems to rise out of the surface. A glow is simply
          a colored shadow with no offset and a large blur, and looks best on dark backgrounds.
          Keep accessibility in mind: neumorphic buttons often have too little contrast to be seen
          clearly.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Can I use the result with Tailwind CSS?</h3>
          <p>Yes - <strong>Copy Tailwind class</strong> gives an arbitrary-value class such as <code>shadow-[0_8px_24px_-4px_rgba(15,23,42,0.18)]</code> that works in Tailwind 3 and 4 without any configuration.</p>
        </div>
        <div className="faq-item">
          <h3>Do shadows slow a page down?</h3>
          <p>Static shadows are cheap. Animating a large, blurry box-shadow can be costly, so for hover effects animate the opacity of a pseudo-element that carries the shadow, or animate <code>transform</code> instead.</p>
        </div>
        <div className="faq-item">
          <h3>What&apos;s the difference between box-shadow and drop-shadow?</h3>
          <p><code>box-shadow</code> follows the element&apos;s box and border radius. The <code>filter: drop-shadow()</code> function follows the actual visible shape, including transparent PNG and SVG outlines, but does not support spread or inset.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Build backgrounds with the <Link to="/tool/css-gradient-generator">CSS Gradient Generator</Link>,
          check text readability with the <Link to="/tool/color-contrast-checker">Color Contrast Checker</Link>,
          or browse all <Link to="/category/developer">Developer tools</Link>.
        </p>
      </article>
    </div>
  );
}
