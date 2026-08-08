import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import { parseColor, rgbToHex } from '../color-converter/colorConversions.js';
import GradientBar from './GradientBar.jsx';
import {
  MIN_STOPS,
  MAX_STOPS,
  GRADIENT_TYPES,
  RADIAL_SHAPES,
  POSITION_OPTIONS,
  PRESETS,
  createDefaultGradient,
  generateGradient,
  generateCssDeclaration,
  addStop,
  removeStop,
  updateStopPosition,
  updateStopColor,
  randomGradient,
  loadPreset,
} from './gradientUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual gradient math (CSS generation, stop editing, random and
// preset gradients) lives in gradientUtils.js and reuses colorConversions.js
// for every bit of color parsing/formatting - this file is just the UI
// wired up to it, re-run directly in the render body on every change (no
// debouncing), like every other converter tool on this site.
//
// Per-stop HEX/RGB text fields deliberately do NOT track their own
// "currently typed" text the way ColorConverter.jsx's five interdependent
// fields do - each one's displayed value is always freshly derived from
// the stop's own canonical color, and an onChange that doesn't parse
// simply does nothing (rather than clearing or reverting the field).
// Since a no-op onChange never triggers a re-render, the browser's own
// input element is left showing exactly what was typed, so this stays
// friendly to type into despite being "fully controlled" - a simpler
// approach that fits 10 near-identical rows better than duplicating the
// heavier five-field synchronization ColorConverter needs.

export default function GradientGenerator() {
  const [defaultGradient] = useState(createDefaultGradient);
  const [gradient, setGradient] = useState(defaultGradient);
  const [copiedCss, setCopiedCss] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');

  const cssGradient = generateGradient(gradient);
  const cssDeclaration = generateCssDeclaration(gradient);

  // Builds a downloadable .css file whenever the declaration text
  // actually changes - same pattern as RegexTester.jsx/TipCalculator.jsx.
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([cssDeclaration], { type: 'text/css' }));
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cssDeclaration]);

  function updateGradient(patch) {
    setGradient((prev) => ({ ...prev, ...patch }));
  }

  function handleStopPositionChange(id, position) {
    setGradient((prev) => ({ ...prev, stops: updateStopPosition(prev.stops, id, position) }));
  }

  function handleStopColorChange(id, color) {
    setGradient((prev) => ({ ...prev, stops: updateStopColor(prev.stops, id, color) }));
  }

  function handleStopHexChange(id, text) {
    const result = parseColor(text);
    if (!result.ok) return; // invalid/mid-typing - leave the field and the color alone
    // A plain 6-digit hex carries no alpha information - keep whatever
    // alpha this stop already had rather than snapping it to opaque.
    const digitCount = text.trim().replace('#', '').length;
    const stop = gradient.stops.find((s) => s.id === id);
    const alpha = digitCount === 8 ? result.rgba.a : (stop?.color.a ?? 1);
    handleStopColorChange(id, { ...result.rgba, a: alpha });
  }

  function handleStopRgbChange(id, text) {
    const result = parseColor(text);
    if (!result.ok) return;
    const stop = gradient.stops.find((s) => s.id === id);
    handleStopColorChange(id, { ...result.rgba, a: stop?.color.a ?? 1 });
  }

  function handleAddStop() {
    setGradient((prev) => ({ ...prev, stops: addStop(prev.stops) }));
  }

  function handleRemoveStop(id) {
    setGradient((prev) => ({ ...prev, stops: removeStop(prev.stops, id) }));
  }

  function handleRandom() {
    setGradient(randomGradient());
  }

  function handlePreset(preset) {
    setGradient(loadPreset(preset));
  }

  function handleClear() {
    setGradient(createDefaultGradient());
  }

  async function handleCopyCss() {
    await navigator.clipboard.writeText(cssDeclaration);
    setCopiedCss(true);
    setTimeout(() => setCopiedCss(false), 1500);
  }

  // A plain structural comparison against the captured pristine default -
  // safe here because both sides are built exclusively from JSON-safe
  // plain data (numbers/strings), always constructed with the same key
  // order via the same factory function, so string equality is exact.
  const hasUnsavedWork = JSON.stringify(gradient) !== JSON.stringify(defaultGradient);
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="gradient-generator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleRandom}>
          🎲 Random Gradient
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div
        className="color-preview-frame gradient-preview-frame"
        style={{ background: cssGradient }}
        aria-label="Gradient preview"
        role="img"
      />

      <GradientBar stops={gradient.stops} cssBackground={cssGradient} onPositionChange={handleStopPositionChange} />

      <div className="field">
        <div className="field-header">
          <label>Gradient type</label>
        </div>
        <div className="mode-toggle" role="group" aria-label="Gradient type">
          {GRADIENT_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              aria-pressed={type.id === gradient.type}
              className={type.id === gradient.type ? 'mode-button active' : 'mode-button'}
              onClick={() => updateGradient({ type: type.id })}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {gradient.type === 'linear' ? (
        <div className="field">
          <label htmlFor="gradient-angle">Angle: {gradient.angle}°</label>
          <div className="gradient-angle-row">
            <input
              id="gradient-angle"
              type="range"
              min="0"
              max="360"
              value={gradient.angle}
              onChange={(event) => updateGradient({ angle: Number(event.target.value) })}
            />
            <input
              type="number"
              min="0"
              max="360"
              className="gradient-angle-number"
              value={gradient.angle}
              onChange={(event) => updateGradient({ angle: Math.max(0, Math.min(360, Number(event.target.value) || 0)) })}
              aria-label="Angle in degrees"
            />
          </div>
        </div>
      ) : (
        <div className="unit-converter-row">
          <div className="field">
            <div className="field-header">
              <label>Shape</label>
            </div>
            <div className="mode-toggle" role="group" aria-label="Radial shape">
              {RADIAL_SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  aria-pressed={shape.id === gradient.radialShape}
                  className={shape.id === gradient.radialShape ? 'mode-button active' : 'mode-button'}
                  onClick={() => updateGradient({ radialShape: shape.id })}
                >
                  {shape.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="gradient-position">Position</label>
            <select
              id="gradient-position"
              value={gradient.radialPosition}
              onChange={(event) => updateGradient({ radialPosition: event.target.value })}
            >
              {POSITION_OPTIONS.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="field">
        <div className="field-header">
          <label>Color stops</label>
          <button type="button" className="ghost-button" onClick={handleAddStop} disabled={gradient.stops.length >= MAX_STOPS}>
            Add Stop
          </button>
        </div>
        <p className="field-hint">
          Drag a handle on the bar above, or edit a stop below. Between {MIN_STOPS} and {MAX_STOPS} stops.
        </p>

        <div className="gradient-stops-list">
          {gradient.stops.map((stop, index) => (
            <div className="gradient-stop-row" key={stop.id}>
              <input
                type="color"
                className="color-picker gradient-stop-picker"
                value={rgbToHex(stop.color)}
                onChange={(event) => handleStopColorChange(stop.id, { ...parseColor(event.target.value).rgba, a: stop.color.a })}
                aria-label={`Color stop ${index + 1} color picker`}
              />

              <div className="field gradient-stop-field">
                <label htmlFor={`gradient-stop-hex-${stop.id}`}>HEX</label>
                <input
                  id={`gradient-stop-hex-${stop.id}`}
                  type="text"
                  value={rgbToHex(stop.color)}
                  onChange={(event) => handleStopHexChange(stop.id, event.target.value)}
                  spellCheck="false"
                  autoComplete="off"
                />
              </div>

              <div className="field gradient-stop-field">
                <label htmlFor={`gradient-stop-rgb-${stop.id}`}>RGB</label>
                <input
                  id={`gradient-stop-rgb-${stop.id}`}
                  type="text"
                  value={`${stop.color.r}, ${stop.color.g}, ${stop.color.b}`}
                  onChange={(event) => handleStopRgbChange(stop.id, event.target.value)}
                  spellCheck="false"
                  autoComplete="off"
                />
              </div>

              <div className="field gradient-stop-field">
                <label htmlFor={`gradient-stop-alpha-${stop.id}`}>Opacity: {Math.round(stop.color.a * 100)}%</label>
                <input
                  id={`gradient-stop-alpha-${stop.id}`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={stop.color.a}
                  onChange={(event) => handleStopColorChange(stop.id, { ...stop.color, a: Number(event.target.value) })}
                />
              </div>

              <div className="field gradient-stop-field gradient-stop-position">
                <label htmlFor={`gradient-stop-position-${stop.id}`}>Position</label>
                <input
                  id={`gradient-stop-position-${stop.id}`}
                  type="number"
                  min="0"
                  max="100"
                  value={stop.position}
                  onChange={(event) => handleStopPositionChange(stop.id, Number(event.target.value) || 0)}
                />
              </div>

              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => handleRemoveStop(stop.id)}
                disabled={gradient.stops.length <= MIN_STOPS}
                aria-label={`Remove color stop ${index + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label>Presets</label>
        </div>
        <div className="gradient-preset-grid">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="gradient-preset-swatch"
              style={{ background: generateGradient(loadPreset(preset)) }}
              onClick={() => handlePreset(preset)}
            >
              <span className="gradient-preset-name">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label>CSS</label>
          <div className="mode-toggle">
            <button type="button" className="ghost-button" onClick={handleCopyCss}>
              {copiedCss ? 'Copied!' : 'Copy CSS'}
            </button>
            <a className="ghost-button" href={downloadUrl || undefined} download={downloadUrl ? 'gradient.css' : undefined}>
              Download CSS
            </a>
          </div>
        </div>
        <pre className="gradient-css-block">
          <code>{cssDeclaration}</code>
        </pre>
      </div>

      <article className="tool-article">
        <p>
          Whether you're styling a hero section, a button hover state, or a card background, this
          tool builds linear and radial CSS gradients visually - drag color stops, fine-tune alpha
          transparency, and copy the exact CSS the moment it looks right. Everything renders
          entirely in your browser using native CSS gradients; nothing is ever uploaded.
        </p>

        <h2>Linear vs. radial gradients</h2>
        <p>
          A <strong>linear gradient</strong> transitions colors along a straight line at a chosen
          angle (0° points up, 90° points right) - the most common choice for backgrounds, buttons,
          and overlays. A <strong>radial gradient</strong> instead radiates outward from a center
          point, shaped as either a <code>circle</code> (equal in all directions) or an{' '}
          <code>ellipse</code> (stretched to match the element's own width/height) - useful for
          spotlight effects, glows, and vignettes.
        </p>

        <h2>CSS gradient examples</h2>
        <ul>
          <li>
            <code>background: linear-gradient(90deg, #5b3df5 0%, #ec4899 100%);</code> - a simple
            two-color horizontal gradient.
          </li>
          <li>
            <code>background: linear-gradient(135deg, #ff512f 0%, #f09819 100%);</code> - a warm
            diagonal "sunset" gradient.
          </li>
          <li>
            <code>background: radial-gradient(circle at center, #12c2e9 0%, #c471ed 100%);</code> -
            a centered radial glow.
          </li>
        </ul>

        <h2>Browser compatibility</h2>
        <p>
          Both <code>linear-gradient()</code> and <code>radial-gradient()</code> have been
          supported, unprefixed, in every major browser (Chrome, Firefox, Safari, Edge) for many
          years - there's no vendor-prefix or fallback needed for the CSS this tool generates.
          Multi-stop transparency (RGBA color stops) is equally universal.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>How do I make a gradient with more than two colors?</h3>
          <p>
            Click "Add Stop" - the new stop is inserted in the middle of the widest existing gap,
            already blended between its two neighbors, up to a maximum of 10 stops.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does the angle actually control?</h3>
          <p>
            For a linear gradient, the angle sets the direction the color transition flows -{' '}
            <code>0deg</code> points straight up, <code>90deg</code> points right,{' '}
            <code>180deg</code> points down, matching the CSS specification exactly (not the
            "0° = right, counterclockwise" convention used in math or some design tools).
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I use these gradients as a text or border color?</h3>
          <p>
            Not directly - CSS gradients are background images, not colors. To apply one to text,
            set it as a <code>background</code>, then add{' '}
            <code>background-clip: text; color: transparent;</code>. For a gradient border, apply
            it to a wrapping element's background and use padding to reveal a border-width sliver.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why does my downloaded/copied CSS look different from the preview?</h3>
          <p>
            It shouldn't - the preview's inline style and the copied/downloaded text are generated
            by the exact same function, so they're always in sync. If a color looks off after
            pasting, check that your project's CSS isn't overriding the same property elsewhere.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my gradient design uploaded anywhere?</h3>
          <p>No - every stop, color, and preview is calculated and rendered locally in your browser; nothing is ever sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/color-converter">Color Converter</Link>, or browse the rest of the{' '}
          <Link to="/category/developer">Developer tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
