import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import {
  parseColor,
  hexToRgb,
  rgbToHex,
  rgbaToHex,
  formatRgb,
  formatRgba,
  formatHsl,
  formatHsla,
  randomRgb,
} from './colorConversions.js';

const FIELD_ORDER = ['hex', 'rgb', 'rgba', 'hsl', 'hsla'];
const FIELD_LABELS = { hex: 'HEX', rgb: 'RGB', rgba: 'RGBA', hsl: 'HSL', hsla: 'HSLA' };
const PLACEHOLDERS = {
  hex: '#FF5733',
  rgb: 'rgb(255, 87, 51)',
  rgba: 'rgba(255, 87, 51, 0.5)',
  hsl: 'hsl(9, 100%, 60%)',
  hsla: 'hsla(9, 100%, 60%, 0.5)',
};
const EMPTY_TEXTS = { hex: '', rgb: '', rgba: '', hsl: '', hsla: '' };

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual color math lives in colorConversions.js - this file is
// just the UI wired up to it.

export default function ColorConverter() {
  // The one canonical color every field is derived from, or null before
  // anything's been entered.
  const [rgba, setRgba] = useState(null);
  // What's actually typed in each of the 5 text fields. Usually these all
  // agree with `rgba`, except the field currently being edited (see the
  // effect below).
  const [texts, setTexts] = useState(EMPTY_TEXTS);
  // Which field (if any) currently has focus - the effect below skips
  // reformatting that one, so we don't fight the user's cursor mid-type.
  const [activeField, setActiveField] = useState(null);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(null);

  useDocumentMeta({
    title: 'Color Converter - HEX, RGB, HSL & More | Rootconverter',
    description:
      'Convert colors instantly between HEX, RGB, RGBA, HSL, and HSLA. Free, fast, and 100% client-side - nothing you enter ever leaves your browser.',
  });

  // Whenever the canonical color changes, refresh every field's text EXCEPT
  // whichever one the user is currently typing in.
  useEffect(() => {
    if (!rgba) return;
    setTexts((prev) => ({
      hex: activeField === 'hex' ? prev.hex : rgbaToHex(rgba),
      rgb: activeField === 'rgb' ? prev.rgb : formatRgb(rgba),
      rgba: activeField === 'rgba' ? prev.rgba : formatRgba(rgba),
      hsl: activeField === 'hsl' ? prev.hsl : formatHsl(rgba),
      hsla: activeField === 'hsla' ? prev.hsla : formatHsla(rgba),
    }));
  }, [rgba, activeField]);

  // Lets you paste a color anywhere on the page, not just inside a specific
  // field - e.g. right after loading the tool, before clicking any input.
  useEffect(() => {
    function handleGlobalPaste(event) {
      // A focused text field already handles paste through its own
      // onChange below - only step in when nothing is focused there.
      if (document.activeElement?.tagName === 'INPUT') return;
      const text = event.clipboardData?.getData('text');
      if (!text) return;
      const result = parseColor(text);
      if (result.ok) {
        event.preventDefault();
        setRgba(result.rgba);
        setActiveField(null);
        setError('');
      }
    }
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  function handleFieldChange(field, newText) {
    setTexts((prev) => ({ ...prev, [field]: newText }));

    if (newText.trim() === '') {
      setError('');
      return;
    }

    const result = parseColor(newText);
    if (result.ok) {
      setRgba(result.rgba);
      setError('');
    } else {
      // Keep the last valid color showing in the preview/other fields -
      // don't blank everything out just because this field is mid-edit.
      setError(result.error);
    }
  }

  function handleColorPicker(event) {
    const picked = hexToRgb(event.target.value);
    // The native picker has no alpha channel - keep whatever alpha we had.
    setRgba({ ...picked, a: rgba ? rgba.a : 1 });
    setActiveField(null);
    setError('');
  }

  function handleRandomColor() {
    setRgba(randomRgb());
    setActiveField(null);
    setError('');
  }

  function handleClear() {
    setRgba(null);
    setTexts(EMPTY_TEXTS);
    setActiveField(null);
    setError('');
  }

  async function handleCopyField(field) {
    if (!texts[field]) return;
    await navigator.clipboard.writeText(texts[field]);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  async function handleCopyAll() {
    const all = FIELD_ORDER.map((field) => `${FIELD_LABELS[field]}: ${texts[field]}`).join('\n');
    await navigator.clipboard.writeText(all);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  }

  async function handleCopySnippet(property, code) {
    await navigator.clipboard.writeText(code);
    setCopiedSnippet(property);
    setTimeout(() => setCopiedSnippet(null), 1500);
  }

  // Any text in any field - even invalid or half-typed - counts as work the
  // user would be annoyed to lose, not just a color that parsed cleanly.
  // Only Clear (which empties everything) turns this back off.
  const hasUnsavedWork = rgba !== null || Object.values(texts).some((text) => text.trim() !== '');
  useUnsavedChangesWarning(hasUnsavedWork);

  const previewColor = rgba ? formatRgba(rgba) : 'transparent';
  const cssSnippets = rgba
    ? [
        { property: 'color', code: `color: ${texts.rgba};` },
        { property: 'background-color', code: `background-color: ${texts.rgba};` },
        { property: 'border-color', code: `border-color: ${texts.rgba};` },
        { property: 'outline-color', code: `outline-color: ${texts.rgba};` },
        { property: 'box-shadow', code: `box-shadow: 0 0 10px ${texts.rgba};` },
      ]
    : [];

  return (
    <div className="color-converter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="color-top-row">
        <input
          type="color"
          className="color-picker"
          value={rgba ? rgbToHex(rgba) : '#000000'}
          onChange={handleColorPicker}
          aria-label="Pick a color"
        />

        <div className="color-preview-frame color-preview-large">
          <div className="color-preview-swatch" style={{ backgroundColor: previewColor }} />
        </div>

        <div className="color-top-info">
          <p className="field-hint">
            {rgba ? `Alpha: ${Math.round(rgba.a * 100)}%` : 'No color yet - type, paste, pick, or generate one'}
          </p>
          <div className="mode-toggle">
            <button type="button" className="mode-button" onClick={handleRandomColor}>
              🎲 Random Color
            </button>
            <button type="button" className="ghost-button" onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="color-fields">
        {FIELD_ORDER.map((field) => (
          <div className="field" key={field}>
            <div className="field-header">
              <label htmlFor={`color-field-${field}`}>{FIELD_LABELS[field]}</label>
              <button
                type="button"
                className="copy-button"
                onClick={() => handleCopyField(field)}
                disabled={!texts[field]}
              >
                {copiedField === field ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="color-field-row">
              <span className="color-preview-frame color-preview-small" aria-hidden="true">
                {rgba && <span className="color-preview-swatch" style={{ backgroundColor: previewColor }} />}
              </span>
              <input
                id={`color-field-${field}`}
                type="text"
                value={texts[field]}
                onChange={(event) => handleFieldChange(field, event.target.value)}
                onFocus={() => setActiveField(field)}
                onBlur={() => setActiveField(null)}
                placeholder={PLACEHOLDERS[field]}
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="download-button" onClick={handleCopyAll} disabled={!rgba}>
        {copiedAll ? 'Copied all!' : 'Copy All'}
      </button>

      {cssSnippets.length > 0 && (
        <div className="field">
          <label>CSS snippets</label>
          <div className="css-snippet-list">
            {cssSnippets.map((snippet) => (
              <div className="css-snippet-row" key={snippet.property}>
                <code>{snippet.code}</code>
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => handleCopySnippet(snippet.property, snippet.code)}
                >
                  {copiedSnippet === snippet.property ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <article className="tool-article">
        <p>
          Whether you're pulling a brand color out of a design file, tweaking a CSS variable, or
          just need to know what <code>#FF5733</code> looks like in <code>hsl()</code>, this tool
          converts between every common web color format instantly, without sending anything
          anywhere.
        </p>

        <h2>How it works</h2>
        <p>
          Type or paste a color in any supported format, use the native picker, or hit "Random
          Color" - every other format updates immediately. Conversions run entirely in your
          browser using the standard CSS Color Module formulas for translating between RGB and
          HSL; nothing you type is ever transmitted anywhere.
        </p>

        <h2>HEX vs RGB vs HSL - what's the difference?</h2>
        <ul>
          <li>
            <strong>HEX</strong> (<code>#RRGGBB</code>) packs red, green, and blue into a 6-digit
            base-16 number. It's compact and easy to copy-paste, and it's the default format in
            most design tools.
          </li>
          <li>
            <strong>RGB</strong> describes the same three channels as plain numbers from 0-255 -
            easier to read and hand-edit, and what most color pickers work with internally.
          </li>
          <li>
            <strong>HSL</strong> describes a color by hue (position on a color wheel, 0-360°),
            saturation (how vivid), and lightness (how close to black or white) - much more
            intuitive for adjusting a color by feel, like "make this darker" or "more vivid,"
            without guessing new numbers.
          </li>
        </ul>

        <h2>When to use each format</h2>
        <ul>
          <li>Use <strong>HEX</strong> for CSS shorthand and copying colors between design apps.</li>
          <li>
            Use <strong>RGB(A)</strong> when you need to read or animate individual channels in
            code, or need transparency alongside plain numbers.
          </li>
          <li>
            Use <strong>HSL(A)</strong> when picking or tweaking a color by feel - for example,
            generating a palette of the same hue at a few different lightness values.
          </li>
        </ul>

        <h2>Formula overview</h2>
        <ul>
          <li><strong>HEX → RGB:</strong> each pair of hex digits (00-FF) is one channel, read as base 16.</li>
          <li>
            <strong>RGB → HSL:</strong> lightness is the average of the highest and lowest
            channel; saturation and hue come from how far apart the channels are and which one is
            largest.
          </li>
          <li>
            <strong>HSL → RGB:</strong> the reverse - hue determines which channel starts out
            highest, then saturation and lightness scale it back down.
          </li>
        </ul>

        <h2>Common mistakes</h2>
        <ul>
          <li>
            Mixing up the HSL value order - it's always hue, saturation, lightness, in that order.
          </li>
          <li>
            Forgetting the <code>%</code> signs on saturation/lightness -{' '}
            <code>hsl(9, 100, 60)</code> isn't valid CSS; it needs{' '}
            <code>hsl(9, 100%, 60%)</code>.
          </li>
          <li>
            Assuming RGB and RGBA are interchangeable - plain RGB has no alpha channel, so pasting
            an RGBA color into an RGB-only field drops its transparency.
          </li>
          <li>Using out-of-range values, like an alpha above 1 or an RGB channel above 255.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>What's the difference between RGB and RGBA?</h3>
          <p>
            RGBA is RGB plus a fourth value (alpha) controlling transparency, from 0 (fully
            transparent) to 1 (fully opaque). Plain RGB is always fully opaque.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I convert a HEX color with transparency?</h3>
          <p>
            Yes - use an 8-digit hex code (<code>#RRGGBBAA</code>), where the last two digits are
            the alpha channel. This tool reads and writes that format.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why does my color look different after converting?</h3>
          <p>
            It shouldn't - every format above describes the exact same color, just written
            differently. If it looks off, double-check you copied the whole string, including the
            alpha value.
          </p>
        </div>
        <div className="faq-item">
          <h3>Does this tool store or upload my colors?</h3>
          <p>No. Every conversion happens in your browser; nothing is ever sent anywhere.</p>
        </div>
        <div className="faq-item">
          <h3>What's the shorthand HEX format (#RGB)?</h3>
          <p>
            A 3-digit hex code where each digit is doubled - <code>#f53</code> is shorthand for{' '}
            <code>#ff5533</code>. It only works when each channel's two hex digits match.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
