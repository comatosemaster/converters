import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatRgb, rgbToHex } from '../color-converter/colorConversions.js';
import {
  CRITERIA,
  contrastRatio,
  effectiveColors,
  formatRatio,
  parseAnyColor,
  suggestColor,
} from './contrastUtils.js';

const DEFAULT_FG = '#6b7280';
const DEFAULT_BG = '#ffffff';

// One color field: the native picker plus a text box that accepts any
// format. The text box keeps exactly what was typed (even mid-edit and
// invalid); the last valid color keeps driving the results meanwhile.
function ColorField({ id, label, text, color, error, onText, onPick }) {
  return (
    <div className="field contrast-color-field">
      <label htmlFor={id}>{label}</label>
      <div className="contrast-color-inputs">
        <input
          type="color"
          className="color-picker"
          value={rgbToHex(color)}
          onChange={(event) => onPick(event.target.value)}
          aria-label={`${label} picker`}
        />
        <input
          id={id}
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          spellCheck="false"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The WCAG formulas and the "nearest passing color" search live in
// contrastUtils.js; color parsing reuses the Color Converter's code.

export default function ColorContrastChecker() {
  const [fgText, setFgText] = useState(DEFAULT_FG);
  const [bgText, setBgText] = useState(DEFAULT_BG);
  const [fgColor, setFgColor] = useState(() => parseAnyColor(DEFAULT_FG).rgba);
  const [bgColor, setBgColor] = useState(() => parseAnyColor(DEFAULT_BG).rgba);
  const [fgError, setFgError] = useState('');
  const [bgError, setBgError] = useState('');
  const [copied, setCopied] = useState('');
  // The colors as they were when last copied - anything changed since then
  // is unsaved work.
  const [savedKey, setSavedKey] = useState(`${DEFAULT_FG}|${DEFAULT_BG}`);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const currentKey = `${fgText}|${bgText}`;
  const hasUnsavedWork = currentKey !== `${DEFAULT_FG}|${DEFAULT_BG}` && currentKey !== savedKey;
  useUnsavedChangesWarning(hasUnsavedWork);

  const { fg, bg } = effectiveColors(fgColor, bgColor);
  const ratio = contrastRatio(fg, bg);
  const results = CRITERIA.map((c) => ({ ...c, pass: ratio >= c.min }));
  const isTranslucent = fgColor.a < 1 || bgColor.a < 1;

  const summary =
    ratio >= 7
      ? { tone: 'pass', text: 'Excellent - passes AAA for all text sizes' }
      : ratio >= 4.5
        ? { tone: 'pass', text: 'Good - passes AA for all text sizes' }
        : ratio >= 3
          ? { tone: 'warn', text: 'Large text and UI elements only - fails AA for normal text' }
          : { tone: 'fail', text: 'Poor - fails every WCAG text requirement' };

  // Suggestions only appear for levels that currently fail, and only when
  // a passing color exists in that direction.
  const suggestions = [];
  [4.5, 7].forEach((target) => {
    if (ratio >= target) return;
    const level = target === 4.5 ? 'AA' : 'AAA';
    const text = suggestColor(fg, bg, target);
    if (text) suggestions.push({ key: `fg-${target}`, which: 'fg', level, ...text });
    const back = suggestColor(bg, fg, target);
    if (back) suggestions.push({ key: `bg-${target}`, which: 'bg', level, ...back });
  });

  function setFromText(which, value) {
    const setText = which === 'fg' ? setFgText : setBgText;
    const setColor = which === 'fg' ? setFgColor : setBgColor;
    const setError = which === 'fg' ? setFgError : setBgError;
    setText(value);
    const parsed = parseAnyColor(value);
    if (parsed.ok) {
      setColor(parsed.rgba);
      setError('');
    } else {
      setError(value.trim() ? parsed.error : '');
    }
  }

  function swap() {
    setFgText(bgText);
    setBgText(fgText);
    setFgColor(bgColor);
    setBgColor(fgColor);
    setFgError(bgError);
    setBgError(fgError);
  }

  async function copy(id, value) {
    await navigator.clipboard.writeText(value);
    setSavedKey(currentKey);
    setCopied(id);
    setTimeout(() => setCopied(''), 1500);
  }

  const fgHex = rgbToHex(fg);
  const bgHex = rgbToHex(bg);
  const cssSnippet = `color: ${fgHex};\nbackground-color: ${bgHex};`;

  return (
    <div className="color-contrast-checker">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset both colors?"
          message="This puts the text and background colors back to the starting pair."
          confirmLabel="Reset"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => {
            setShowResetConfirm(false);
            setFromText('fg', DEFAULT_FG);
            setFromText('bg', DEFAULT_BG);
          }}
        />
      )}

      <div className="contrast-inputs">
        <ColorField
          id="contrast-fg"
          label="Text color"
          text={fgText}
          color={fgColor}
          error={fgError}
          onText={(value) => setFromText('fg', value)}
          onPick={(value) => setFromText('fg', value)}
        />
        <button type="button" className="swap-button contrast-swap" onClick={swap} title="Swap text and background">
          &#8646; Swap
        </button>
        <ColorField
          id="contrast-bg"
          label="Background color"
          text={bgText}
          color={bgColor}
          error={bgError}
          onText={(value) => setFromText('bg', value)}
          onPick={(value) => setFromText('bg', value)}
        />
      </div>

      <div className="contrast-result">
        <div className="contrast-score" aria-live="polite">
          <span className="contrast-ratio">{formatRatio(ratio)}</span>
          <span className={`contrast-summary contrast-${summary.tone}`}>{summary.text}</span>
          {isTranslucent && (
            <span className="field-hint">
              Transparent colors are measured as they appear: text blended over the background,
              and the background over white.
            </span>
          )}
        </div>

        <div className="contrast-preview" style={{ color: fgHex, backgroundColor: bgHex }}>
          <p className="contrast-preview-large">Large text: the quick brown fox</p>
          <p className="contrast-preview-normal">
            Normal text at 16px - the size most body copy uses. Can you read this comfortably?
          </p>
          <p className="contrast-preview-small">Small print at 13px, like captions and footnotes.</p>
          <div className="contrast-preview-ui">
            <span className="contrast-preview-button" style={{ borderColor: fgHex }}>
              Outline button
            </span>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="contrast-preview-link">A text link</span>
          </div>
        </div>
      </div>

      <div className="contrast-criteria">
        {results.map((r) => (
          <div key={r.id} className={r.pass ? 'contrast-criterion pass' : 'contrast-criterion fail'}>
            <span className="contrast-criterion-badge">{r.pass ? '✓ Pass' : '✗ Fail'}</span>
            <span className="contrast-criterion-name">
              {r.label} <strong>{r.level}</strong>
            </span>
            <span className="contrast-criterion-min">needs {r.min}:1</span>
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <section className="contrast-suggestions" aria-label="Suggested colors">
          <h2 className="pdf-section-heading">Closest colors that pass</h2>
          <p className="field-hint">
            Same hue, with the lightness changed as little as possible. Pick one to apply it.
          </p>
          <ul>
            {suggestions.map((s) => (
              <li key={s.key}>
                <span
                  className="contrast-suggestion-sample"
                  style={
                    s.which === 'fg'
                      ? { color: s.hex, backgroundColor: bgHex }
                      : { color: fgHex, backgroundColor: s.hex }
                  }
                >
                  Aa
                </span>
                <span className="contrast-suggestion-text">
                  <strong>{s.level}</strong> - {s.which === 'fg' ? 'text' : 'background'} <code>{s.hex}</code>{' '}
                  <span className="field-hint">({formatRatio(s.ratio)})</span>
                </span>
                <button type="button" className="ghost-button" onClick={() => setFromText(s.which, s.hex)}>
                  Use
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="field">
        <div className="field-header">
          <label>CSS</label>
          <div className="contrast-actions">
            <button type="button" className="copy-button" onClick={() => copy('css', cssSnippet)}>
              {copied === 'css' ? 'Copied!' : 'Copy CSS'}
            </button>
            <button type="button" className="ghost-button" onClick={() => copy('fg', fgHex)}>
              {copied === 'fg' ? 'Copied!' : `Copy ${fgHex}`}
            </button>
            <button type="button" className="ghost-button" onClick={() => copy('bg', bgHex)}>
              {copied === 'bg' ? 'Copied!' : `Copy ${bgHex}`}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowResetConfirm(true)}
              disabled={currentKey === `${DEFAULT_FG}|${DEFAULT_BG}`}
            >
              Reset
            </button>
          </div>
        </div>
        <pre className="gradient-css-block">
          <code>{cssSnippet}</code>
        </pre>
        <p className="field-hint">
          {formatRgb(fg)} on {formatRgb(bg)}
        </p>
      </div>

      <article className="tool-article">
        <p>
          This contrast checker tells you whether text is easy enough to read against its
          background, using the Web Content Accessibility Guidelines (WCAG) that accessibility
          laws and audits refer to. Pick two colors to see the contrast ratio, a pass or fail for
          each WCAG level, a live preview, and the closest colors that would pass. It runs in your
          browser.
        </p>

        <h2>What the contrast ratio means</h2>
        <p>
          The ratio compares how bright the two colors are, from <strong>1:1</strong> (identical)
          to <strong>21:1</strong> (black on white). It is calculated from each color&apos;s
          relative luminance - how bright it looks to the human eye, which is far more sensitive
          to green than to blue. That is why yellow text on white is hard to read even though the
          colors look very different.
        </p>

        <h2>WCAG requirements</h2>
        <ul>
          <li><strong>AA, normal text: 4.5:1</strong> - the level most laws and company policies require.</li>
          <li><strong>AA, large text: 3:1</strong> - large means at least 24px, or 18.66px (14pt) when bold.</li>
          <li><strong>AA, user interface components: 3:1</strong> - icons, input borders, focus outlines and chart lines (WCAG 1.4.11).</li>
          <li><strong>AAA: 7:1 for normal text, 4.5:1 for large text</strong> - the enhanced level, recommended for long reading and older readers.</li>
        </ul>
        <p>
          There is no rounding in WCAG: 4.49:1 fails AA. This checker rounds down when it shows
          the ratio, so a value displayed as passing really does pass.
        </p>

        <h2>Fixing a color that fails</h2>
        <p>
          When a pair fails, the tool searches for the nearest color that passes - keeping the
          same hue and saturation and only making it lighter or darker - for both the text and the
          background. This keeps your brand color recognisable while fixing the problem, instead
          of falling back to plain black or gray.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Which color formats can I enter?</h3>
          <p>HEX (with or without the #), RGB, RGBA, HSL, HSLA and CSS color names such as <code>navy</code> or <code>rebeccapurple</code>. Transparent colors are measured as they would appear on screen.</p>
        </div>
        <div className="faq-item">
          <h3>Does passing WCAG guarantee readable text?</h3>
          <p>It is a strong baseline, not a guarantee. Very thin fonts, small sizes and text over images can still be hard to read at a passing ratio, so check the preview too.</p>
        </div>
        <div className="faq-item">
          <h3>What about APCA and WCAG 3?</h3>
          <p>APCA is a newer contrast method proposed for the future WCAG 3. It is still a draft, so WCAG 2.2&apos;s ratio - used here - remains the standard that audits and laws such as the ADA and the European Accessibility Act refer to.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Convert colors between formats with the <Link to="/tool/color-converter">Color Converter</Link>,
          pull a color scheme out of a photo with the{' '}
          <Link to="/tool/image-palette-extractor">Color Palette Extractor</Link>, or browse all{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
