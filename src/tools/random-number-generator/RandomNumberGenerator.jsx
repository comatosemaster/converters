import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import {
  DEFAULT_MIN,
  DEFAULT_MAX,
  DEFAULT_QUANTITY,
  MIN_QUANTITY,
  MAX_QUANTITY,
  GENERATE_ANIMATION_MS,
  createDefaultOptions,
  validateRange,
  generateNumbers,
  sortNumbers,
  calculateLowest,
  calculateHighest,
  formatNumber,
  addGenerationToHistory,
} from './randomNumberUtils.js';

const DEFAULT_OPTIONS = createDefaultOptions();

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual number generation/validation/sorting lives in
// randomNumberUtils.js - this file is just the UI wired up to it, plus a
// sub-1s "counting" animation: a fast-cycling flicker of random numbers
// (setInterval) within the chosen range, then a single setTimeout reveals
// the real, already-decided (and already-sorted) result. Same shape as
// DiceRoller.jsx/CoinFlip.jsx's roll/flip animations.

export default function RandomNumberGenerator() {
  const [minInput, setMinInput] = useState(DEFAULT_MIN);
  const [maxInput, setMaxInput] = useState(DEFAULT_MAX);
  const [quantityInput, setQuantityInput] = useState(DEFAULT_QUANTITY);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);

  const [results, setResults] = useState(null);
  const [displayValues, setDisplayValues] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);

  const flickerIntervalRef = useRef(null);
  const generateTimeoutRef = useRef(null);

  // Guards against setState-after-unmount if someone navigates away
  // mid-animation (it's still "in flight" for up to ~900ms).
  useEffect(() => {
    return () => {
      clearInterval(flickerIntervalRef.current);
      clearTimeout(generateTimeoutRef.current);
    };
  }, []);

  const validation = validateRange(minInput, maxInput, quantityInput, options);

  function updateOption(id, value) {
    setOptions((prev) => {
      const next = { ...prev, [id]: value };
      // Ascending and descending are mutually exclusive - checking one
      // turns the other off rather than leaving both checked (which
      // would be a contradictory "sort order").
      if (id === 'sortAscending' && value) next.sortDescending = false;
      if (id === 'sortDescending' && value) next.sortAscending = false;
      return next;
    });
  }

  function handleGenerate() {
    if (!validation.ok) return;
    const { min, max, quantity } = validation.values;

    setResults(null);
    setCopied(false);
    setIsGenerating(true);
    setDisplayValues(generateNumbers({ min, max, quantity, integersOnly: options.integersOnly, allowDuplicates: true }));

    clearInterval(flickerIntervalRef.current);
    flickerIntervalRef.current = setInterval(() => {
      setDisplayValues(generateNumbers({ min, max, quantity, integersOnly: options.integersOnly, allowDuplicates: true }));
    }, 70);

    clearTimeout(generateTimeoutRef.current);
    generateTimeoutRef.current = setTimeout(() => {
      clearInterval(flickerIntervalRef.current);
      const raw = generateNumbers({ min, max, quantity, integersOnly: options.integersOnly, allowDuplicates: options.allowDuplicates });
      const finalResults = sortNumbers(raw, options.sortAscending, options.sortDescending);
      setResults(finalResults);
      setDisplayValues(finalResults);
      setIsGenerating(false);
      setHistory((prev) =>
        addGenerationToHistory(prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          count: quantity,
          summary: `${quantity}× [${min}-${max}]: ${finalResults.map((value) => formatNumber(value, options.integersOnly)).join(', ')}`,
        }),
      );
    }, GENERATE_ANIMATION_MS);
  }

  function handleClear() {
    clearInterval(flickerIntervalRef.current);
    clearTimeout(generateTimeoutRef.current);
    setMinInput(DEFAULT_MIN);
    setMaxInput(DEFAULT_MAX);
    setQuantityInput(DEFAULT_QUANTITY);
    setOptions(DEFAULT_OPTIONS);
    setResults(null);
    setDisplayValues([]);
    setIsGenerating(false);
    setCopied(false);
  }

  function handleClearHistory() {
    setHistory([]);
  }

  async function handleCopy() {
    if (!results) return;
    await navigator.clipboard.writeText(results.map((value) => formatNumber(value, options.integersOnly)).join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function optionsEqual(a, b) {
    return (
      a.allowDuplicates === b.allowDuplicates &&
      a.integersOnly === b.integersOnly &&
      a.sortAscending === b.sortAscending &&
      a.sortDescending === b.sortDescending
    );
  }

  const hasUnsavedWork =
    minInput !== DEFAULT_MIN ||
    maxInput !== DEFAULT_MAX ||
    quantityInput !== DEFAULT_QUANTITY ||
    !optionsEqual(options, DEFAULT_OPTIONS) ||
    results !== null ||
    isGenerating;
  useUnsavedChangesWarning(hasUnsavedWork);

  const lowest = results ? calculateLowest(results) : null;
  const highest = results ? calculateHighest(results) : null;

  return (
    <div className="random-number-generator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="rng-min">Minimum</label>
          <input
            id="rng-min"
            type="text"
            inputMode="decimal"
            value={minInput}
            onChange={(event) => setMinInput(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="rng-max">Maximum</label>
          <input
            id="rng-max"
            type="text"
            inputMode="decimal"
            value={maxInput}
            onChange={(event) => setMaxInput(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="rng-quantity">Quantity</label>
          <input
            id="rng-quantity"
            type="text"
            inputMode="numeric"
            value={quantityInput}
            onChange={(event) => setQuantityInput(event.target.value)}
            autoComplete="off"
          />
          <p className="field-hint">
            Between {MIN_QUANTITY} and {MAX_QUANTITY}.
          </p>
        </div>
      </div>
      {validation.error && <p className="field-error">{validation.error}</p>}

      <fieldset className="field password-options-fieldset">
        <legend>Options</legend>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={options.allowDuplicates}
            onChange={(event) => updateOption('allowDuplicates', event.target.checked)}
          />
          Allow duplicates
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={options.integersOnly}
            onChange={(event) => updateOption('integersOnly', event.target.checked)}
          />
          Integers only
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={options.sortAscending}
            onChange={(event) => updateOption('sortAscending', event.target.checked)}
          />
          Sort ascending
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={options.sortDescending}
            onChange={(event) => updateOption('sortDescending', event.target.checked)}
          />
          Sort descending
        </label>
      </fieldset>

      <div className="mode-toggle dice-actions">
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={!validation.ok}>
          Generate
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={handleGenerate}
          disabled={!validation.ok || (!results && !isGenerating)}
        >
          Generate Again
        </button>
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={!results}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {(displayValues.length > 0 || isGenerating) && (
        <div className="dice-tray rng-tray" aria-live="polite" aria-atomic="true">
          {displayValues.map((value, index) => (
            <div key={index} className={isGenerating ? 'rng-face is-counting' : 'rng-face'}>
              {formatNumber(value, options.integersOnly)}
            </div>
          ))}
        </div>
      )}

      {results && !isGenerating && (
        <div className="unit-result">
          <dl className="comparison-meta">
            <div>
              <dt>Lowest</dt>
              <dd>{formatNumber(lowest, options.integersOnly)}</dd>
            </div>
            <div>
              <dt>Highest</dt>
              <dd>{formatNumber(highest, options.integersOnly)}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{results.length}</dd>
            </div>
          </dl>
        </div>
      )}

      {history.length > 0 && (
        <div className="field">
          <div className="field-header">
            <label>Generation history</label>
            <button type="button" className="ghost-button" onClick={handleClearHistory}>
              Clear History
            </button>
          </div>
          <ul className="unit-recent-list">
            {history.map((entry) => (
              <li key={entry.id}>
                <div className="unit-recent-item">
                  <span className="unit-recent-summary">{entry.summary}</span>
                  <span className="unit-recent-meta">{entry.count}× generated</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <article className="tool-article">
        <p>
          Whether you're picking a raffle winner, generating test data, or just need a quick random
          pick within a range, this tool generates random numbers instantly - entirely in your
          browser, with a quick counting animation, duplicate control, sorting, and a running
          history of what you've generated.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Can I generate decimal numbers, not just whole numbers?</h3>
          <p>
            Yes - uncheck "Integers only" to get random decimals (rounded to 2 places for display)
            anywhere within your minimum and maximum.
          </p>
        </div>
        <div className="faq-item">
          <h3>What happens if I ask for more unique numbers than the range allows?</h3>
          <p>
            With "Allow duplicates" turned off, whole-number ranges can only produce as many unique
            values as the range actually contains (e.g. 1-10 has exactly 10 possible whole numbers)
            - asking for more shows a friendly message telling you exactly how many are available.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I sort the results?</h3>
          <p>
            Yes - "Sort ascending" and "Sort descending" order the generated numbers from lowest to
            highest or highest to lowest; leaving both unchecked keeps them in the order they were
            generated.
          </p>
        </div>
        <div className="faq-item">
          <h3>Where does my generation history go when I leave the page?</h3>
          <p>
            It's kept only in this tab's memory for the current session, capped at the last 20
            generations, and never saved to disk or sent anywhere - reloading the page clears it.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is anything about my generated numbers uploaded anywhere?</h3>
          <p>No - every number is generated and calculated locally in your browser; nothing is ever sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/dice-roller">Dice Roller</Link> or{' '}
          <Link to="/tool/coin-flip">Coin Flip</Link>, or browse the rest of the{' '}
          <Link to="/category/fun">Fun</Link> tools on Rootconverter.
        </p>
      </article>
    </div>
  );
}
