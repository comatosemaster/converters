import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import { buildChartGeometry } from '../currency-converter/currencyUtils.js';
import { CONTRIBUTION_FREQUENCIES, calculateSavings, formatCurrency, validateSavingsInputs } from './savingsUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The growth chart reuses buildChartGeometry() from the Currency
// Converter (turns an array of { value } points into an SVG path) rather
// than a new charting mechanism, and the .currency-chart* CSS classes
// that already style that exact line-plus-area-fill look - a savings
// balance over time and an exchange rate over time are visually the same
// shape of chart.

const CHART_WIDTH = 640;
const CHART_HEIGHT = 200;

const DEFAULT_FREQUENCY = CONTRIBUTION_FREQUENCIES[0].id;

export default function SavingsCalculator() {
  const [initialText, setInitialText] = useState('');
  const [contributionText, setContributionText] = useState('');
  const [frequencyId, setFrequencyId] = useState(DEFAULT_FREQUENCY);
  const [rateText, setRateText] = useState('');
  const [yearsText, setYearsText] = useState('');
  const [copied, setCopied] = useState(false);
  const resultRef = useRef(null);

  useDocumentMeta({
    title: 'Savings Calculator - Compound Interest & Growth | Rootconverter',
    description:
      'Calculate how your savings grow over time with compound interest and regular contributions. See your final balance, total contributions, total interest, and a growth chart - free and entirely in your browser.',
  });

  // Re-validates and re-calculates on every change, like every other
  // converter on this site - the "Calculate" button below exists for
  // people who expect one, not because anything waits for it.
  const validation = validateSavingsInputs({ initialText, contributionText, rateText, yearsText, frequencyId });
  const result = validation.ok ? calculateSavings(validation) : null;
  const chartGeometry = result ? buildChartGeometry(result.chartPoints, CHART_WIDTH, CHART_HEIGHT) : null;

  function handleClear() {
    setInitialText('');
    setContributionText('');
    setFrequencyId(DEFAULT_FREQUENCY);
    setRateText('');
    setYearsText('');
    setCopied(false);
  }

  async function handleCopy() {
    if (!result) return;
    const text =
      `Final balance: ${formatCurrency(result.finalBalance)} - ` +
      `Total contributions: ${formatCurrency(result.totalContributions)} - ` +
      `Total interest earned: ${formatCurrency(result.totalInterest)}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const hasUnsavedWork =
    initialText.trim() !== '' ||
    contributionText.trim() !== '' ||
    rateText.trim() !== '' ||
    yearsText.trim() !== '' ||
    frequencyId !== DEFAULT_FREQUENCY;
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="savings-calculator">
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
          <label htmlFor="savings-initial">Initial savings</label>
          <input
            id="savings-initial"
            type="text"
            inputMode="decimal"
            value={initialText}
            onChange={(event) => setInitialText(event.target.value)}
            placeholder="e.g. 1000"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="savings-contribution">Contribution amount</label>
          <input
            id="savings-contribution"
            type="text"
            inputMode="decimal"
            value={contributionText}
            onChange={(event) => setContributionText(event.target.value)}
            placeholder="e.g. 100"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label>Contribution frequency</label>
        </div>
        <div className="mode-toggle" role="group" aria-label="Contribution frequency">
          {CONTRIBUTION_FREQUENCIES.map((frequency) => (
            <button
              key={frequency.id}
              type="button"
              aria-pressed={frequency.id === frequencyId}
              className={frequency.id === frequencyId ? 'mode-button active' : 'mode-button'}
              onClick={() => setFrequencyId(frequency.id)}
            >
              {frequency.label}
            </button>
          ))}
        </div>
      </div>

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="savings-rate">Annual interest rate (%)</label>
          <input
            id="savings-rate"
            type="text"
            inputMode="decimal"
            value={rateText}
            onChange={(event) => setRateText(event.target.value)}
            placeholder="e.g. 4.5"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="savings-years">Savings period (years)</label>
          <input
            id="savings-years"
            type="text"
            inputMode="decimal"
            value={yearsText}
            onChange={(event) => setYearsText(event.target.value)}
            placeholder="e.g. 10"
            autoComplete="off"
          />
        </div>
      </div>

      {/* The result already recomputes live on every keystroke, matching
          every other calculator on this site - this button exists for
          people who expect an explicit trigger, and moves focus down to
          the result for anyone tabbing through the form. */}
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
        <p className="field-hint">
          Enter your initial savings, contribution, interest rate, and period above to see how it grows.
        </p>
      ) : (
        <>
          <dl className="age-total-grid savings-result-grid" tabIndex={-1} ref={resultRef} aria-live="polite">
            <div>
              <dt>Final balance</dt>
              <dd>{formatCurrency(result.finalBalance)}</dd>
            </div>
            <div>
              <dt>Total contributions</dt>
              <dd>{formatCurrency(result.totalContributions)}</dd>
            </div>
            <div>
              <dt>Total interest earned</dt>
              <dd>{formatCurrency(result.totalInterest)}</dd>
            </div>
          </dl>

          <div className="currency-chart" aria-label="Savings balance growth over time">
            <svg
              className="currency-chart-svg"
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
            >
              <path className="currency-chart-area" d={chartGeometry.areaPath} />
              <path className="currency-chart-line" d={chartGeometry.path} />
            </svg>
            <div className="currency-chart-meta">
              <span>Year 0: {formatCurrency(result.chartPoints[0].value)}</span>
              <span>
                Range: {formatCurrency(chartGeometry.minValue)} - {formatCurrency(chartGeometry.maxValue)}
              </span>
              <span>
                Year {result.chartPoints[result.chartPoints.length - 1].year}:{' '}
                {formatCurrency(result.chartPoints[result.chartPoints.length - 1].value)}
              </span>
            </div>
          </div>
        </>
      )}

      <p className="field-warning">
        This calculator provides estimates for informational purposes only. Actual savings may
        vary depending on interest rates, account terms, fees, taxes, and compounding frequency.
      </p>

      <article className="tool-article">
        <p>
          See how your savings could grow with regular contributions and compound interest - enter
          a starting amount, how much you plan to add and how often, an interest rate, and a time
          period, and watch the final balance, total contributions, and interest earned update
          instantly alongside a simple growth chart.
        </p>

        <h2>How the calculation works</h2>
        <p>
          Interest compounds monthly on the current balance, and your contribution is added on
          whatever schedule you choose - monthly or yearly. Contributions start earning interest
          the month after they're added, not retroactively, which matches how most real savings
          and investment accounts actually work.
        </p>

        <h2>Contributions vs. interest</h2>
        <p>
          <strong>Total contributions</strong> is simply your initial savings plus every deposit
          you made along the way - it's the money that actually came out of your pocket.{' '}
          <strong>Total interest earned</strong> is everything on top of that: the difference
          between your final balance and what you put in, which is what compounding actually
          bought you.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Does this account for taxes or fees?</h3>
          <p>
            No - this is a simple compound-interest projection. Real accounts often involve taxes
            on interest, account fees, or variable rates that this calculator doesn't model.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does "compounding monthly" mean?</h3>
          <p>
            Interest is calculated and added to the balance every month rather than once a year,
            so each month's interest is calculated on a slightly larger balance than the last -
            this is how most savings and high-yield accounts actually compound.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I model a one-time deposit with no ongoing contributions?</h3>
          <p>Yes - enter your initial savings and set the contribution amount to 0.</p>
        </div>
        <div className="faq-item">
          <h3>Why does the chart look almost flat at first and steeper later?</h3>
          <p>
            That's compounding - interest earned in early years is small relative to the balance,
            but as the balance grows, each year's interest becomes a larger absolute amount, so
            the curve accelerates over time.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my financial information uploaded anywhere?</h3>
          <p>No - every calculation happens locally in your browser; nothing is ever sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/currency-converter">Currency Converter</Link>, or browse the
          rest of the <Link to="/category/business-finance">Business &amp; Finance tools</Link> on
          Rootconverter.
        </p>
      </article>
    </div>
  );
}
