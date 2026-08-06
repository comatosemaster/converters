import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import CurrencySelect from './CurrencySelect.jsx';
import { fetchCurrencies, fetchExchangeRate, fetchHistoricalRates } from './currencyApi.js';
import {
  DEFAULT_FROM,
  DEFAULT_TO,
  DEFAULT_PERIOD_ID,
  POPULAR_CURRENCY_CODES,
  PERIOD_OPTIONS,
  getPeriodById,
  validateAmount,
  convertCurrency,
  swapCurrencies,
  formatCurrencyAmount,
  formatRate,
  formatDateDisplay,
  addRecentConversion,
  buildChartGeometry,
} from './currencyUtils.js';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 200;

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All network access (Frankfurter) lives in currencyApi.js, and all pure
// math/formatting/chart geometry lives in currencyUtils.js - this file is
// just the UI wired up to both, plus the effects that decide WHEN to
// fetch. The amount field is deliberately NOT part of what triggers a
// network request: only 1 unit of `from` -> `to` is ever fetched, and the
// user's amount is multiplied in locally (convertCurrency), so retyping
// the amount is instant and never hits the network.

export default function CurrencyConverter() {
  const [currencies, setCurrencies] = useState([]);
  const [isLoadingCurrencies, setIsLoadingCurrencies] = useState(true);
  const [currenciesError, setCurrenciesError] = useState('');

  const [amount, setAmount] = useState('');
  const [fromCode, setFromCode] = useState(DEFAULT_FROM);
  const [toCode, setToCode] = useState(DEFAULT_TO);

  const [rate, setRate] = useState(null);
  const [rateDate, setRateDate] = useState(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [rateError, setRateError] = useState('');

  const [periodId, setPeriodId] = useState(DEFAULT_PERIOD_ID);
  const [chartPoints, setChartPoints] = useState([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [chartError, setChartError] = useState('');

  const [recentConversions, setRecentConversions] = useState([]);
  const [copied, setCopied] = useState(false);

  useDocumentMeta({
    title: 'Currency Converter - Live Exchange Rates | Rootconverter',
    description:
      'Convert between world currencies using live exchange rates, with a historical rate chart going back up to a year. Free, fast, and always current - powered by the Frankfurter API.',
  });

  // Popular currencies are only ever shown once they're confirmed to
  // exist in the fetched list - Frankfurter's ECB-sourced data doesn't
  // cover every currency someone might expect (see currencyUtils.js).
  const popularCodes = useMemo(
    () => POPULAR_CURRENCY_CODES.filter((code) => currencies.some((currency) => currency.code === code)),
    [currencies],
  );

  // --- Fetching currencies (once, with a manual retry) -----------------------

  const loadCurrencies = useCallback(async (signal) => {
    setIsLoadingCurrencies(true);
    setCurrenciesError('');
    try {
      const list = await fetchCurrencies(signal);
      setCurrencies(list);
    } catch (error) {
      if (error.name === 'AbortError') return;
      setCurrenciesError(error.message);
    } finally {
      setIsLoadingCurrencies(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadCurrencies(controller.signal);
    return () => controller.abort();
  }, [loadCurrencies]);

  // --- Fetching the live rate (whenever the currency pair changes) -----------

  // Holds the latest amount WITHOUT being a dependency of loadRate below -
  // that's what lets a currency change re-fetch only the rate (not
  // debounce against every keystroke), while still letting a freshly
  // resolved rate immediately record a recent-conversion entry using
  // whatever amount is currently sitting in the field.
  const amountRef = useRef(amount);
  useEffect(() => {
    amountRef.current = amount;
  }, [amount]);

  function recordConversion(rateValue, dateValue, from, to) {
    const validation = validateAmount(amountRef.current);
    if (!validation.ok || rateValue == null) return;
    const converted = convertCurrency(validation.value, rateValue);
    setRecentConversions((prev) =>
      addRecentConversion(prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amount: validation.value,
        from,
        to,
        rate: rateValue,
        date: dateValue,
        summary: `${validation.value} ${from} = ${formatCurrencyAmount(converted, to)}`,
      }),
    );
  }

  const loadRate = useCallback(
    async (signal) => {
      setIsLoadingRate(true);
      setRateError('');
      try {
        const result = await fetchExchangeRate(fromCode, toCode, signal);
        setRate(result.rate);
        setRateDate(result.date);
        recordConversion(result.rate, result.date, fromCode, toCode);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setRateError(error.message);
        setRate(null);
      } finally {
        setIsLoadingRate(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fromCode, toCode],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadRate(controller.signal);
    return () => controller.abort();
  }, [loadRate]);

  // --- Fetching the historical chart (currency pair + period) ----------------

  const loadChart = useCallback(async (signal) => {
    setIsLoadingChart(true);
    setChartError('');
    try {
      const period = getPeriodById(periodId);
      const points = await fetchHistoricalRates(fromCode, toCode, period.days, signal);
      setChartPoints(points);
    } catch (error) {
      if (error.name === 'AbortError') return;
      setChartError(error.message);
      setChartPoints([]);
    } finally {
      setIsLoadingChart(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCode, toCode, periodId]);

  useEffect(() => {
    const controller = new AbortController();
    loadChart(controller.signal);
    return () => controller.abort();
  }, [loadChart]);

  // --- Derived values, re-computed on every render (all local, no network) --

  const validation = validateAmount(amount);
  const convertedAmount = validation.ok && rate != null ? convertCurrency(validation.value, rate) : null;
  const chartGeometry = buildChartGeometry(chartPoints, CHART_WIDTH, CHART_HEIGHT);

  // --- Handlers ----------------------------------------------------------------

  function handleAmountBlur() {
    recordConversion(rate, rateDate, fromCode, toCode);
  }

  function handleSwap() {
    const swapped = swapCurrencies(fromCode, toCode);
    setFromCode(swapped.from);
    setToCode(swapped.to);
  }

  function handleClear() {
    setAmount('');
    setFromCode(DEFAULT_FROM);
    setToCode(DEFAULT_TO);
    setPeriodId(DEFAULT_PERIOD_ID);
    setCopied(false);
  }

  function handleRestoreRecent(entry) {
    setAmount(String(entry.amount));
    setFromCode(entry.from);
    setToCode(entry.to);
  }

  async function handleCopy() {
    if (convertedAmount == null) return;
    const text = `${validation.value} ${fromCode} = ${formatCurrencyAmount(convertedAmount, toCode)} (rate: ${formatRate(rate)}, updated ${formatDateDisplay(rateDate)})`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const hasUnsavedWork =
    amount.trim() !== '' || fromCode !== DEFAULT_FROM || toCode !== DEFAULT_TO || periodId !== DEFAULT_PERIOD_ID;
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="currency-converter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={convertedAmount == null}>
          {copied ? 'Copied!' : 'Copy Result'}
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {currenciesError && (
        <p className="field-error">
          {currenciesError}{' '}
          <button type="button" className="ghost-button btn-sm" onClick={() => loadCurrencies()}>
            <RotateCw size={13} aria-hidden="true" /> Retry
          </button>
        </p>
      )}

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="currency-amount">Amount</label>
          <input
            id="currency-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={handleAmountBlur}
            placeholder="e.g. 100"
            autoComplete="off"
          />
          {validation.error && <p className="field-error">{validation.error}</p>}
        </div>

        <CurrencySelect
          id="currency-from"
          label="From"
          value={fromCode}
          onChange={setFromCode}
          currencies={currencies}
          popularCodes={popularCodes}
          disabled={isLoadingCurrencies || Boolean(currenciesError)}
        />

        <div className="field unit-swap-field">
          <label htmlFor="currency-swap" aria-hidden="true">
            &nbsp;
          </label>
          <button
            id="currency-swap"
            type="button"
            className="swap-button unit-swap-button"
            onClick={handleSwap}
            aria-label={`Swap ${fromCode} and ${toCode}`}
            title="Swap currencies"
          >
            ⇄
          </button>
        </div>

        <CurrencySelect
          id="currency-to"
          label="To"
          value={toCode}
          onChange={setToCode}
          currencies={currencies}
          popularCodes={popularCodes}
          disabled={isLoadingCurrencies || Boolean(currenciesError)}
        />
      </div>

      {rateError ? (
        <p className="field-error">
          {rateError}{' '}
          <button type="button" className="ghost-button btn-sm" onClick={() => loadRate()}>
            <RotateCw size={13} aria-hidden="true" /> Retry
          </button>
        </p>
      ) : amount.trim() === '' ? (
        <p className="field-hint">Enter an amount above to see the converted result.</p>
      ) : !validation.ok ? null : isLoadingRate && rate == null ? (
        <p className="field-hint">Fetching the latest exchange rate…</p>
      ) : (
        convertedAmount != null && (
          <div className="unit-result" aria-live="polite">
            <p className="unit-result-value">{formatCurrencyAmount(convertedAmount, toCode)}</p>
            <p className="field-hint">
              1 {fromCode} = {formatRate(rate)} {toCode}
              {isLoadingRate && ' (updating…)'}
            </p>
            <p className="field-hint">Last updated: {formatDateDisplay(rateDate)}</p>
          </div>
        )
      )}

      <div className="field">
        <div className="field-header">
          <label>Historical rate</label>
          <div className="mode-toggle" role="group" aria-label="Chart period">
            {PERIOD_OPTIONS.map((period) => (
              <button
                key={period.id}
                type="button"
                aria-pressed={period.id === periodId}
                className={period.id === periodId ? 'mode-button active' : 'mode-button'}
                onClick={() => setPeriodId(period.id)}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        {chartError ? (
          <p className="field-error">
            {chartError}{' '}
            <button type="button" className="ghost-button btn-sm" onClick={() => loadChart()}>
              <RotateCw size={13} aria-hidden="true" /> Retry
            </button>
          </p>
        ) : isLoadingChart && chartPoints.length === 0 ? (
          <p className="field-hint">Loading historical rates…</p>
        ) : chartPoints.length === 0 ? (
          <p className="field-hint">No historical data available for this pair.</p>
        ) : (
          <div className="currency-chart" aria-label={`${fromCode} to ${toCode} exchange rate over ${getPeriodById(periodId).label.toLowerCase()}`}>
            <svg
              className="currency-chart-svg"
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-hidden="true"
            >
              <path className="currency-chart-area" d={chartGeometry.areaPath} />
              <path className="currency-chart-line" d={chartGeometry.path} />
            </svg>
            <div className="currency-chart-meta">
              <span>{formatDateDisplay(chartPoints[0].date)}</span>
              <span>
                Range: {formatRate(chartGeometry.minValue)} – {formatRate(chartGeometry.maxValue)}
              </span>
              <span>{formatDateDisplay(chartPoints[chartPoints.length - 1].date)}</span>
            </div>
          </div>
        )}
      </div>

      {recentConversions.length > 0 && (
        <div className="field">
          <div className="field-header">
            <label>Recent conversions</label>
          </div>
          <ul className="unit-recent-list">
            {recentConversions.map((entry) => (
              <li key={entry.id}>
                <button type="button" className="unit-recent-item" onClick={() => handleRestoreRecent(entry)}>
                  <span className="unit-recent-summary">{entry.summary}</span>
                  <span className="unit-recent-meta">{formatDateDisplay(entry.date)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <article className="tool-article">
        <p>
          Whether you're planning a trip, pricing an international invoice, or just curious what
          your salary would look like abroad, this tool converts between world currencies using
          live rates - fetched from the Frankfurter API, which republishes the European Central
          Bank's daily reference rates, with a chart showing how a pair has moved over time.
        </p>

        <h2>How exchange rates work</h2>
        <p>
          An exchange rate is simply how many units of one currency it takes to equal one unit of
          another - if 1 USD = 0.86 EUR, then $100 converts to €86. Rates are set by the global
          foreign exchange market, where currencies are continuously bought and sold; the "official"
          reference rates this tool uses are fixed once a day by the European Central Bank based on
          that day's market activity.
        </p>

        <h2>Why exchange rates change</h2>
        <p>
          Currency values shift constantly based on factors like a country's interest rates,
          inflation, political stability, trade balance, and overall economic outlook - a currency
          from a country with rising interest rates or a strong economy tends to strengthen against
          others, while political uncertainty or high inflation tends to weaken it. This is also why
          the historical chart above is rarely a flat line: even "stable" currency pairs typically
          drift a percent or two over the course of a month.
        </p>

        <h2>Common currency conversions</h2>
        <ul>
          <li><strong>USD → EUR</strong> - US Dollar to Euro, one of the most-traded pairs in the world.</li>
          <li><strong>USD → GBP</strong> - US Dollar to British Pound.</li>
          <li><strong>EUR → GBP</strong> - Euro to British Pound, common across European travel and trade.</li>
          <li><strong>USD → JPY</strong> - US Dollar to Japanese Yen.</li>
          <li><strong>USD → CAD</strong> - US Dollar to Canadian Dollar.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>How often do the rates update?</h3>
          <p>
            The European Central Bank publishes new reference rates once each business day, so
            rates here update daily rather than tick-by-tick like a live trading platform - fine
            for everyday conversions, not for time-sensitive trading decisions.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why is a currency I'm looking for missing?</h3>
          <p>
            This tool covers whatever the Frankfurter API supports - a few dozen major-economy
            currencies sourced from the European Central Bank. Some currencies (for example GEL,
            the Georgian Lari) aren't part of that ECB list and so aren't available here.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why does the chart have gaps between some dates?</h3>
          <p>
            The European Central Bank doesn't publish rates on weekends or its own holidays, so
            those dates simply have no entry - the chart plots whatever business days are
            available for the selected period.
          </p>
        </div>
        <div className="faq-item">
          <h3>What happens if the exchange rate service is unreachable?</h3>
          <p>
            A friendly error message appears in place of the result or chart, with a Retry button -
            nothing crashes, and your amount and currency selections stay exactly as you left them.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my conversion data uploaded anywhere?</h3>
          <p>
            Only the currency codes and dates needed to fetch a rate are sent to the Frankfurter
            API - the amount you type is never sent anywhere; the actual multiplication happens
            locally in your browser.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/business-finance">Business &amp; Finance</Link> tools on Rootconverter.
        </p>
      </article>
    </div>
  );
}
