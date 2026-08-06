import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import {
  DEFAULT_COIN_COUNT,
  MIN_COINS,
  MAX_COINS,
  FLIP_ANIMATION_MS,
  validateCoinCount,
  flipCoins,
  countHeads,
  countTails,
  calculateHeadsPercentage,
  formatPercentage,
  addFlipToHistory,
} from './coinUtils.js';

const FACE_LABEL = { heads: 'Heads', tails: 'Tails' };

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual flip math lives in coinUtils.js - this file is just the
// UI wired up to it, plus the ~1s flip animation: a fast-cycling
// "flicker" of random heads/tails (setInterval) layered under a pure-CSS
// 3D spin (see .coin-face.is-flipping in index.css), then a single
// setTimeout reveals the real, already-decided result. Same shape as
// DiceRoller.jsx's roll animation - just a different face set and timing.

export default function CoinFlip() {
  const [coinCountInput, setCoinCountInput] = useState(DEFAULT_COIN_COUNT);
  const [results, setResults] = useState(null);
  const [displayValues, setDisplayValues] = useState([]);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipHistory, setFlipHistory] = useState([]);

  const flickerIntervalRef = useRef(null);
  const flipTimeoutRef = useRef(null);

  // Guards against setState-after-unmount if someone navigates away
  // mid-flip (the animation is still "in flight" for up to 1s).
  useEffect(() => {
    return () => {
      clearInterval(flickerIntervalRef.current);
      clearTimeout(flipTimeoutRef.current);
    };
  }, []);

  useDocumentMeta({
    title: 'Coin Flip - Free & Client-Side | Rootconverter',
    description:
      'Flip one or up to 100 virtual coins in your browser, with a smooth spinning animation, heads/tails totals, percentage split, and flip history. Nothing is ever uploaded.',
  });

  const validation = validateCoinCount(coinCountInput);

  function handleFlip() {
    if (!validation.ok) return;
    const count = validation.value;

    setResults(null);
    setIsFlipping(true);
    setDisplayValues(flipCoins(count));

    clearInterval(flickerIntervalRef.current);
    flickerIntervalRef.current = setInterval(() => {
      setDisplayValues(flipCoins(count));
    }, 80);

    clearTimeout(flipTimeoutRef.current);
    flipTimeoutRef.current = setTimeout(() => {
      clearInterval(flickerIntervalRef.current);
      const finalResults = flipCoins(count);
      setResults(finalResults);
      setDisplayValues(finalResults);
      setIsFlipping(false);
      const heads = countHeads(finalResults);
      setFlipHistory((prev) =>
        addFlipToHistory(prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          count,
          heads,
          tails: count - heads,
          summary:
            count === 1
              ? FACE_LABEL[finalResults[0]]
              : `${count}× flip: ${heads} heads, ${count - heads} tails`,
        }),
      );
    }, FLIP_ANIMATION_MS);
  }

  function handleClear() {
    clearInterval(flickerIntervalRef.current);
    clearTimeout(flipTimeoutRef.current);
    setCoinCountInput(DEFAULT_COIN_COUNT);
    setResults(null);
    setDisplayValues([]);
    setIsFlipping(false);
  }

  function handleClearHistory() {
    setFlipHistory([]);
  }

  const hasUnsavedWork = coinCountInput !== DEFAULT_COIN_COUNT || results !== null || isFlipping;
  useUnsavedChangesWarning(hasUnsavedWork);

  const heads = results ? countHeads(results) : null;
  const tails = results ? countTails(results) : null;
  const headsPercentage = results ? calculateHeadsPercentage(results) : null;

  return (
    <div className="coin-flip">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="field">
        <label htmlFor="coin-count">Number of coins</label>
        <input
          id="coin-count"
          type="text"
          inputMode="numeric"
          value={coinCountInput}
          onChange={(event) => setCoinCountInput(event.target.value)}
          placeholder="e.g. 1"
          autoComplete="off"
        />
        <p className="field-hint">
          Between {MIN_COINS} and {MAX_COINS} coins.
        </p>
        {validation.error && <p className="field-error">{validation.error}</p>}
      </div>

      <div className="mode-toggle dice-actions">
        <button type="button" className="btn btn-primary" onClick={handleFlip} disabled={!validation.ok}>
          Flip
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={handleFlip}
          disabled={!validation.ok || (!results && !isFlipping)}
        >
          Flip Again
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {(displayValues.length > 0 || isFlipping) && (
        <div className="dice-tray" aria-live="polite" aria-atomic="true">
          {displayValues.map((value, index) => (
            <div key={index} className={isFlipping ? 'coin-face is-flipping' : 'coin-face'}>
              {value === 'heads' ? 'H' : 'T'}
            </div>
          ))}
        </div>
      )}

      {results && !isFlipping && (
        <div className="unit-result">
          {results.length === 1 && <p className="unit-result-value">{FACE_LABEL[results[0]]}</p>}
          <dl className="comparison-meta">
            <div>
              <dt>Total Heads</dt>
              <dd>{heads}</dd>
            </div>
            <div>
              <dt>Total Tails</dt>
              <dd>{tails}</dd>
            </div>
            <div>
              <dt>Heads Percentage</dt>
              <dd>{formatPercentage(headsPercentage)}</dd>
            </div>
          </dl>
        </div>
      )}

      {flipHistory.length > 0 && (
        <div className="field">
          <div className="field-header">
            <label>Flip history</label>
            <button type="button" className="ghost-button" onClick={handleClearHistory}>
              Clear History
            </button>
          </div>
          <ul className="unit-recent-list">
            {flipHistory.map((entry) => (
              <li key={entry.id}>
                <div className="unit-recent-item">
                  <span className="unit-recent-summary">{entry.summary}</span>
                  <span className="unit-recent-meta">{entry.count}× flipped</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <article className="tool-article">
        <p>
          Whether you're settling a decision, picking who goes first, or running a quick
          probability demo, this tool flips one or up to a hundred virtual coins at once - entirely
          in your browser, with a smooth spinning animation and a running history of your flips.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is the coin flip actually fair?</h3>
          <p>
            Yes - each flip uses JavaScript's standard random number generator with an even 50/50
            chance of heads or tails, the same fairness you'd expect from an ideal, perfectly
            balanced physical coin.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why doesn't flipping 10 coins give exactly 5 heads and 5 tails?</h3>
          <p>
            Randomness doesn't guarantee an even split every time - it only means each individual
            flip is 50/50. Flip a larger number of coins and the percentage will tend to land closer
            to 50%, though it's rarely exact even at 100 coins.
          </p>
        </div>
        <div className="faq-item">
          <h3>How many coins can I flip at once?</h3>
          <p>Up to 100 coins in a single flip, with the individual results shown alongside the heads/tails totals and percentage.</p>
        </div>
        <div className="faq-item">
          <h3>Where does my flip history go when I leave the page?</h3>
          <p>
            It's kept only in this tab's memory for the current session, capped at the last 20
            flips, and never saved to disk or sent anywhere - reloading the page clears it.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is anything about my flips uploaded anywhere?</h3>
          <p>No - every flip is generated and calculated locally in your browser; nothing is ever sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/dice-roller">Dice Roller</Link> or the{' '}
          <Link to="/tool/random-number-generator">Random Number Generator</Link>, or browse the
          rest of the <Link to="/category/fun">Fun</Link> tools on Rootconverter.
        </p>
      </article>
    </div>
  );
}
