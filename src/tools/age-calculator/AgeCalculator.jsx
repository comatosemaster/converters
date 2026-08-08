import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import { calculateAge, formatLongDate, pluralize, todayDateInputValue, validateAgeInputs } from './ageUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// Re-validates and re-calculates on every change - no explicit "Calculate"
// button needed for that (the spec's Calculate button is kept for
// discoverability/muscle memory, but it does the same thing the live
// recompute already does). Matches how BmiCalculator and every other
// converter on this site works.

const TODAY = todayDateInputValue();

export default function AgeCalculator() {
  const [birthDateInput, setBirthDateInput] = useState('');
  const [asOfDateInput, setAsOfDateInput] = useState(TODAY);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef(null);

  const validation = validateAgeInputs(birthDateInput, asOfDateInput);
  const result = validation.ok ? calculateAge(validation.birthDate, validation.asOfDate) : null;

  function handleClear() {
    setBirthDateInput('');
    setAsOfDateInput(TODAY);
    setCopied(false);
  }

  async function handleCopy() {
    if (!result) return;
    const text =
      `Age: ${pluralize(result.years, 'year')}, ${pluralize(result.months, 'month')}, ${pluralize(result.days, 'day')} ` +
      `(${result.totalDays.toLocaleString()} days total) - Next birthday: ${formatLongDate(result.nextBirthdayDate)}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Loading a birth date (or moving the "as of" date away from today)
  // counts as work worth protecting - matches the "mark modified when
  // either date changes" spec, and Clear resets both back to their
  // pristine defaults.
  const hasUnsavedWork = birthDateInput.trim() !== '' || asOfDateInput !== TODAY;
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="age-calculator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={!result}>
          {copied ? 'Copied!' : 'Copy Result'}
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="age-birth-date">Date of birth</label>
          <input
            id="age-birth-date"
            type="date"
            value={birthDateInput}
            max={asOfDateInput || TODAY}
            onChange={(event) => setBirthDateInput(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="age-as-of-date">Calculate as of</label>
          <input
            id="age-as-of-date"
            type="date"
            value={asOfDateInput}
            onChange={(event) => setAsOfDateInput(event.target.value || TODAY)}
          />
        </div>
      </div>

      {/* The result already recomputes live on every keystroke, matching
          every other calculator on this site - this button exists for
          people who expect an explicit trigger, and moves focus down to
          the result, which is a real action for anyone tabbing through
          rather than reading the live-updating region as they type. */}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!validation.ok}
        onClick={() => resultRef.current?.focus()}
      >
        Calculate
      </button>

      {validation.error && <p className="field-error">{validation.error}</p>}

      {!result ? (
        <p className="field-hint">Enter a date of birth above to see the age breakdown.</p>
      ) : (
        <div className="unit-result age-result" tabIndex={-1} ref={resultRef} aria-live="polite">
          {result.isBirthdayToday && <p className="age-birthday-banner">🎉 Happy birthday!</p>}

          <p className="unit-result-value">
            {result.years} <span className="age-result-unit">yr</span> {result.months}{' '}
            <span className="age-result-unit">mo</span> {result.days} <span className="age-result-unit">d</span>
          </p>

          <dl className="age-total-grid">
            <div>
              <dt>Total months</dt>
              <dd>{result.totalMonths.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Total weeks</dt>
              <dd>{result.totalWeeks.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Total days</dt>
              <dd>{result.totalDays.toLocaleString()}</dd>
            </div>
          </dl>

          <p className="field-hint">
            {result.isBirthdayToday ? (
              'Next birthday: today!'
            ) : (
              <>
                Next birthday: {formatLongDate(result.nextBirthdayDate)} ({pluralize(result.daysUntilBirthday, 'day')}{' '}
                away)
              </>
            )}
          </p>
        </div>
      )}

      <article className="tool-article">
        <p>
          Enter a date of birth to see an exact age breakdown - years, months, and days, plus
          running totals in months, weeks, and days, and a countdown to the next birthday.
          Everything recalculates instantly as you type, entirely in your browser.
        </p>

        <h2>Calculating as of a different date</h2>
        <p>
          The "Calculate as of" field defaults to today, but you can set it to any other date -
          useful for figuring out how old someone was (or will be) on a specific historical or
          future date, like an event date or an eligibility cutoff.
        </p>

        <h2>How the age breakdown works</h2>
        <p>
          Years, months, and days are calculated calendar-style: a "month" means the same day
          next month (whatever length that month actually is), not a fixed 30-day span - so the
          breakdown matches how people actually describe age. The total months, weeks, and days
          figures are separate running counts from the date of birth, useful when you want one
          single number instead of a mixed breakdown.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>How is a February 29 birthday handled?</h3>
          <p>
            In non-leap years, a February 29 birthday is treated as falling on February 28 for
            the purposes of the birthday countdown and "happy birthday" message - the same way
            it's conventionally observed.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I calculate age as of a past or future date?</h3>
          <p>
            Yes - change the "Calculate as of" field to any date on or after the date of birth.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why do total months and the months in the breakdown differ?</h3>
          <p>
            The breakdown's "months" is a remainder (0-11) alongside years and days. "Total
            months" is every whole month lived, as one running number - for someone 2 years and 3
            months old, that's 27.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my date of birth uploaded anywhere?</h3>
          <p>No - the calculation happens entirely in your browser; nothing is ever sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/world-clock-time-zone-converter">World Clock &amp; Time Zone Converter</Link>,
          or browse the rest of the <Link to="/category/everyday">Everyday tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
