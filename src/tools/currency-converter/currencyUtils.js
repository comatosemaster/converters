// -----------------------------------------------------------------------
// CURRENCY CONVERSION LOGIC - no React, no DOM, no network (that's
// currencyApi.js). Pure functions only, so this file can be read (or
// reused) completely independently of the UI in CurrencyConverter.jsx.
// -----------------------------------------------------------------------

export const DEFAULT_FROM = 'USD';
export const DEFAULT_TO = 'EUR';

// A currency-code wishlist for the quick-select chips. Deliberately NOT
// assumed to all exist - CurrencyConverter.jsx filters this against
// whatever fetchCurrencies() actually returns before rendering, since
// Frankfurter only republishes the ECB's list (a few dozen major
// economies) and some requested currencies - e.g. GEL - simply aren't in
// it. Filtering rather than hardcoding avoids ever wiring up a quick-pick
// button for a currency the API would then reject.
export const POPULAR_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'GEL'];

export const PERIOD_OPTIONS = [
  { id: '7d', label: '7 Days', days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
  { id: '1y', label: '1 Year', days: 365 },
];

export const DEFAULT_PERIOD_ID = '30d';

export function getPeriodById(id) {
  return PERIOD_OPTIONS.find((period) => period.id === id) ?? PERIOD_OPTIONS[1];
}

// Checks the amount is usable before conversion is attempted. Returns
// `{ ok: true, value }` or `{ ok: false, error }` - never throws, so the
// UI never needs a try/catch of its own. Matches the vocabulary
// (validate*, ok/error/value) used throughout the rest of this site.
export function validateAmount(input) {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: '' }; // empty isn't an "error" to display

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Enter a valid number.' };
  }
  if (value < 0) {
    return { ok: false, error: 'Amount cannot be negative.' };
  }
  if (value > 1e15) {
    return { ok: false, error: 'That amount is too large to convert.' };
  }
  return { ok: true, value };
}

export function convertCurrency(amount, rate) {
  return amount * rate;
}

export function swapCurrencies(from, to) {
  return { from: to, to: from };
}

// Formats a converted amount using the browser's own currency formatting
// (correct symbol, grouping, and decimal placement for that currency) -
// falls back to a plain "1234.56 XYZ" for any code Intl doesn't recognize
// rather than throwing and blanking the whole result.
export function formatCurrencyAmount(value, code) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 4 }).format(
      value,
    );
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}

// Exchange rates span a huge range (e.g. 1 USD = 0.86 EUR vs 1 USD = 157
// JPY) - a fixed decimal count would either drown small rates in noise or
// truncate large ones. Six significant-ish decimals for sub-1 rates, two
// for anything larger, with trailing zeros trimmed.
export function formatRate(rate) {
  if (!Number.isFinite(rate)) return '—';
  const decimals = rate < 1 ? 6 : rate < 100 ? 4 : 2;
  return rate.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function formatDateDisplay(isoDate) {
  if (!isoDate) return '—';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// --- Recent conversions -------------------------------------------------------

const MAX_RECENT = 10;

// Prepends a new entry and caps the list at MAX_RECENT - the same
// "newest first, capped" shape used by unitUtils.js and tipUtils.js for
// their own recent-history lists.
export function addRecentConversion(list, entry) {
  return [entry, ...list].slice(0, MAX_RECENT);
}

// --- Chart geometry -------------------------------------------------------------

// Turns a list of { date, value } points into SVG-ready geometry: an
// x/y position for every point (scaled to fit `width` x `height`) and a
// single path string connecting them. Pure math only - the component
// just drops the result into an <svg><path>. Points are spaced evenly by
// INDEX rather than by real calendar distance, which is what makes
// weekend/holiday gaps in the underlying data (see currencyApi.js) a
// non-issue - there's no missing x-position to leave a gap in, since the
// x-axis isn't a literal calendar in the first place.
export function buildChartGeometry(points, width, height, padding = 10) {
  if (points.length === 0) {
    return { path: '', areaPath: '', points: [], minValue: 0, maxValue: 0 };
  }

  const values = points.map((point) => point.value);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  if (minValue === maxValue) {
    // Flat data (e.g. converting a currency to itself) - fake a small
    // range so the line renders as a visible flat stroke instead of
    // collapsing every point onto the same y-coordinate.
    minValue -= 1;
    maxValue += 1;
  }

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const scaled = points.map((point, index) => {
    const x = points.length === 1 ? padding : padding + (index / (points.length - 1)) * innerWidth;
    const y = padding + innerHeight - ((point.value - minValue) / (maxValue - minValue)) * innerHeight;
    return { ...point, x, y };
  });

  const path = scaled.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  // Closes the line into a filled shape sitting on the chart's baseline,
  // for a subtle area fill under the stroke.
  const areaPath = `${path} L${scaled[scaled.length - 1].x.toFixed(2)},${(height - padding).toFixed(2)} L${scaled[0].x.toFixed(2)},${(height - padding).toFixed(2)} Z`;

  return { path, areaPath, points: scaled, minValue, maxValue };
}
