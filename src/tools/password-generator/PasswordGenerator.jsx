import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import {
  CHARACTER_SETS,
  MIN_LENGTH,
  MAX_LENGTH,
  createDefaultOptions,
  validateOptions,
  generatePassword,
  estimateStrength,
} from './passwordUtils.js';

const DEFAULT_OPTIONS = createDefaultOptions();

function optionsEqual(a, b) {
  return CHARACTER_SETS.every((set) => a[set.id] === b[set.id]) && a.length === b.length && a.excludeSimilar === b.excludeSimilar;
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual generation and strength-scoring logic lives in
// passwordUtils.js (built on crypto.getRandomValues(), never Math.random())
// - this file is just the UI wired up to it.

export default function PasswordGenerator() {
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(true);
  const [copied, setCopied] = useState(false);

  const validation = validateOptions(options);
  const strength = estimateStrength(password);

  function updateOption(id, value) {
    setOptions((prev) => ({ ...prev, [id]: value }));
  }

  function handleGenerate() {
    if (!validation.ok) return;
    setPassword(generatePassword(options));
    setCopied(false);
  }

  async function handleCopy() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleClear() {
    setOptions(DEFAULT_OPTIONS);
    setPassword('');
    setRevealed(true);
    setCopied(false);
  }

  const hasUnsavedWork = password !== '' || !optionsEqual(options, DEFAULT_OPTIONS);
  useUnsavedChangesWarning(hasUnsavedWork);

  const strengthPercent = strength.bits === 0 ? 0 : Math.max(8, Math.min(100, Math.round((strength.bits / 100) * 100)));

  return (
    <div className="password-generator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="field">
        <label htmlFor="pw-length">Password length: {options.length}</label>
        <input
          id="pw-length"
          type="range"
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          value={options.length}
          onChange={(event) => updateOption('length', Number(event.target.value))}
        />
        <p className="field-hint">
          Between {MIN_LENGTH} and {MAX_LENGTH} characters.
        </p>
      </div>

      <fieldset className="field password-options-fieldset">
        <legend>Character types</legend>
        {CHARACTER_SETS.map((set) => (
          <label key={set.id} className="checkbox-field">
            <input
              type="checkbox"
              checked={options[set.id]}
              onChange={(event) => updateOption(set.id, event.target.checked)}
            />
            {set.label}
          </label>
        ))}
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={options.excludeSimilar}
            onChange={(event) => updateOption('excludeSimilar', event.target.checked)}
          />
          Exclude similar characters (O, 0, l, I, 1)
        </label>
        {!validation.ok && <p className="field-error">{validation.error}</p>}
      </fieldset>

      <div className="mode-toggle password-actions">
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={!validation.ok}>
          Generate
        </button>
        <button type="button" className="ghost-button" onClick={handleGenerate} disabled={!validation.ok || !password}>
          Regenerate
        </button>
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={!password}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="field">
        <label htmlFor="pw-output">Generated password</label>
        <div className="password-preview-row">
          <input
            id="pw-output"
            type={revealed ? 'text' : 'password'}
            className="password-preview-input"
            value={password}
            readOnly
            placeholder="Click Generate to create a password"
            aria-label="Generated password"
          />
          <button
            type="button"
            className="btn btn-ghost password-reveal-toggle"
            onClick={() => setRevealed((prev) => !prev)}
            disabled={!password}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide password' : 'Reveal password'}
            title={revealed ? 'Hide password' : 'Reveal password'}
          >
            {revealed ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {password && (
        <div className="field password-strength" aria-live="polite">
          <div className="password-strength-header">
            <span>Strength</span>
            <span className={`password-strength-label password-strength-${strength.label.toLowerCase()}`}>
              {strength.label}
            </span>
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-label="Password strength"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={strengthPercent}
          >
            <div
              className={`progress-bar-fill password-strength-fill-${strength.label.toLowerCase()}`}
              style={{ width: `${strengthPercent}%` }}
            />
          </div>
        </div>
      )}

      <article className="tool-article">
        <p>
          Whether you're signing up for a new account, replacing a reused password, or setting up
          a password manager, this tool generates cryptographically random passwords entirely in
          your browser using the Web Crypto API - nothing you generate is ever uploaded or logged.
        </p>

        <h2>Tips for creating strong passwords</h2>
        <ul>
          <li>Use at least 16 characters - length matters more for security than any single character type.</li>
          <li>Enable all four character types (uppercase, lowercase, numbers, symbols) when a site allows it.</li>
          <li>Never reuse the same password across multiple sites - a breach on one no longer exposes the rest.</li>
          <li>Store generated passwords in a password manager rather than memorizing or writing them down.</li>
          <li>Only turn on "Exclude similar characters" when you expect to type the password by hand - it slightly shrinks the character pool.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>How random is the generated password?</h3>
          <p>
            Every character is chosen using <code>crypto.getRandomValues()</code>, the Web
            Crypto API's cryptographically secure random number source - not{' '}
            <code>Math.random()</code>, which is fast but not suitable for anything
            security-sensitive since it isn't guaranteed to be unpredictable.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does the strength indicator measure?</h3>
          <p>
            It estimates entropy in bits from the password's length and which character types it
            actually contains, then buckets that into Weak, Medium, or Strong - a rough, transparent
            guide rather than a guarantee against any specific attack.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why exclude similar characters?</h3>
          <p>
            Characters like uppercase O, the digit 0, lowercase l, uppercase I, and the digit 1 can
            look identical in some fonts - useful to exclude if you'll ever need to type the
            password by hand instead of copy-pasting it.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why won't the Generate button work?</h3>
          <p>
            At least one character type (uppercase, lowercase, numbers, or symbols) needs to be
            enabled - with everything unchecked there's no pool of characters left to generate from.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my generated password ever sent anywhere?</h3>
          <p>
            No - generation, the strength estimate, and the copy button all run locally in your
            browser; nothing is ever transmitted or stored anywhere.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/developer">Developer tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
