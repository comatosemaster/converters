import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import {
  DICE_TYPES,
  DEFAULT_DICE_TYPE_ID,
  DEFAULT_DICE_COUNT,
  MIN_DICE,
  MAX_DICE,
  ROLL_ANIMATION_MS,
  getDiceTypeById,
  validateDiceCount,
  rollDice,
  calculateTotal,
  calculateAverage,
  formatAverage,
  addRollToHistory,
} from './diceUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual rolling math lives in diceUtils.js - this file is just
// the UI wired up to it, plus the ~800ms roll animation: a fast-cycling
// "flicker" of random face values (setInterval) layered under a pure-CSS
// shake/rotate (see .dice-face.is-rolling in index.css), then a single
// setTimeout reveals the real, already-decided result.

export default function DiceRoller() {
  const [diceTypeId, setDiceTypeId] = useState(DEFAULT_DICE_TYPE_ID);
  const [diceCountInput, setDiceCountInput] = useState(DEFAULT_DICE_COUNT);
  const [results, setResults] = useState(null);
  const [displayValues, setDisplayValues] = useState([]);
  const [isRolling, setIsRolling] = useState(false);
  const [rollHistory, setRollHistory] = useState([]);

  const flickerIntervalRef = useRef(null);
  const rollTimeoutRef = useRef(null);

  // Guards against setState-after-unmount if someone navigates away
  // mid-roll (the animation is still "in flight" for up to 800ms).
  useEffect(() => {
    return () => {
      clearInterval(flickerIntervalRef.current);
      clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  const diceType = getDiceTypeById(diceTypeId);
  const validation = validateDiceCount(diceCountInput);

  function handleRoll() {
    if (!validation.ok) return;
    const count = validation.value;

    setResults(null);
    setIsRolling(true);
    setDisplayValues(rollDice(diceType.sides, count));

    clearInterval(flickerIntervalRef.current);
    flickerIntervalRef.current = setInterval(() => {
      setDisplayValues(rollDice(diceType.sides, count));
    }, 80);

    clearTimeout(rollTimeoutRef.current);
    rollTimeoutRef.current = setTimeout(() => {
      clearInterval(flickerIntervalRef.current);
      const finalResults = rollDice(diceType.sides, count);
      setResults(finalResults);
      setDisplayValues(finalResults);
      setIsRolling(false);
      setRollHistory((prev) =>
        addRollToHistory(prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label: diceType.label,
          count,
          total: calculateTotal(finalResults),
          summary: `${count}× ${diceType.label}: ${finalResults.join(', ')}`,
        }),
      );
    }, ROLL_ANIMATION_MS);
  }

  function handleClear() {
    clearInterval(flickerIntervalRef.current);
    clearTimeout(rollTimeoutRef.current);
    setDiceTypeId(DEFAULT_DICE_TYPE_ID);
    setDiceCountInput(DEFAULT_DICE_COUNT);
    setResults(null);
    setDisplayValues([]);
    setIsRolling(false);
  }

  function handleClearHistory() {
    setRollHistory([]);
  }

  const hasUnsavedWork =
    diceTypeId !== DEFAULT_DICE_TYPE_ID || diceCountInput !== DEFAULT_DICE_COUNT || results !== null || isRolling;
  useUnsavedChangesWarning(hasUnsavedWork);

  const total = results ? calculateTotal(results) : null;
  const average = results ? calculateAverage(results) : null;

  return (
    <div className="dice-roller">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="field">
        <div className="field-header">
          <label>Dice type</label>
        </div>
        <div className="mode-toggle" role="group" aria-label="Dice type">
          {DICE_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              aria-pressed={type.id === diceTypeId}
              className={type.id === diceTypeId ? 'mode-button active' : 'mode-button'}
              onClick={() => setDiceTypeId(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="dice-count">Number of dice</label>
        <input
          id="dice-count"
          type="text"
          inputMode="numeric"
          value={diceCountInput}
          onChange={(event) => setDiceCountInput(event.target.value)}
          placeholder="e.g. 2"
          autoComplete="off"
        />
        <p className="field-hint">
          Between {MIN_DICE} and {MAX_DICE} dice.
        </p>
        {validation.error && <p className="field-error">{validation.error}</p>}
      </div>

      <div className="mode-toggle dice-actions">
        <button type="button" className="btn btn-primary" onClick={handleRoll} disabled={!validation.ok}>
          Roll
        </button>
        <button type="button" className="ghost-button" onClick={handleRoll} disabled={!validation.ok || (!results && !isRolling)}>
          Roll Again
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {(displayValues.length > 0 || isRolling) && (
        <div className="dice-tray" aria-live="polite" aria-atomic="true">
          {displayValues.map((value, index) => (
            <div key={index} className={isRolling ? 'dice-face is-rolling' : 'dice-face'}>
              {value}
            </div>
          ))}
        </div>
      )}

      {results && !isRolling && (
        <div className="unit-result">
          <dl className="comparison-meta">
            <div>
              <dt>Total</dt>
              <dd>{total}</dd>
            </div>
            <div>
              <dt>Average</dt>
              <dd>{formatAverage(average)}</dd>
            </div>
            <div>
              <dt>Dice rolled</dt>
              <dd>
                {results.length}× {diceType.label}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {rollHistory.length > 0 && (
        <div className="field">
          <div className="field-header">
            <label>Roll history</label>
            <button type="button" className="ghost-button" onClick={handleClearHistory}>
              Clear History
            </button>
          </div>
          <ul className="unit-recent-list">
            {rollHistory.map((entry) => (
              <li key={entry.id}>
                <div className="unit-recent-item">
                  <span className="unit-recent-summary">{entry.summary}</span>
                  <span className="unit-recent-meta">Total {entry.total}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <article className="tool-article">
        <p>
          Whether you're playing a tabletop RPG, settling a decision, or just need a quick D6 for a
          board game, this tool rolls one or many virtual dice - D4 through D100 - entirely in your
          browser, with a smooth shake-and-reveal animation and a running history of your rolls.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Are the rolls actually random?</h3>
          <p>
            Each die uses JavaScript's standard random number generator, giving every face an equal
            chance of coming up - the same fairness you'd expect from a well-made physical die.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does D100 mean?</h3>
          <p>
            A D100 (or "percentile die") rolls a number from 1 to 100 - useful for percentage-based
            outcomes in tabletop games, often physically rolled as two ten-sided dice instead of one
            hundred-sided one, though the math here is identical either way.
          </p>
        </div>
        <div className="faq-item">
          <h3>How many dice can I roll at once?</h3>
          <p>Up to 20 dice in a single roll, all of the same type, shown individually alongside the total and average.</p>
        </div>
        <div className="faq-item">
          <h3>Where does my roll history go when I leave the page?</h3>
          <p>
            It's kept only in this tab's memory for the current session, capped at the last 20
            rolls, and never saved to disk or sent anywhere - reloading the page clears it.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is anything about my rolls uploaded anywhere?</h3>
          <p>No - every roll is generated and calculated locally in your browser; nothing is ever sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try <Link to="/tool/coin-flip">Coin Flip</Link> or the{' '}
          <Link to="/tool/random-number-generator">Random Number Generator</Link>, or browse the rest
          of the <Link to="/category/fun">Fun</Link> tools on Rootconverter.
        </p>
      </article>
    </div>
  );
}
