// -----------------------------------------------------------------------
// FRANKFURTER API CLIENT - the only file in this tool that touches the
// network. Every function here returns a plain value on success or
// THROWS a friendly, already-readable Error on failure - CurrencyConverter.jsx
// catches those in one place rather than every call site needing its own
// try/catch + message-writing logic.
//
// Frankfurter (https://frankfurter.dev) is a free, no-API-key-required
// service that republishes the European Central Bank's daily reference
// rates. Two things follow from that:
//   - It only covers the ~30 currencies the ECB publishes (a major-economy
//     list - things like GEL aren't included). See POPULAR_CURRENCY_CODES
//     in currencyUtils.js, which is filtered against whatever this API
//     actually returns rather than assuming a fixed list.
//   - Rates only update on ECB business days - weekends and some holidays
//     simply don't get a new entry, which is why historical data can have
//     gaps between consecutive dates.
// -----------------------------------------------------------------------

// frankfurter.app (the domain in Frankfurter's own docs) 301-redirects to
// this canonical API host - calling it directly avoids that extra
// round-trip on every request.
const API_BASE = 'https://api.frankfurter.dev/v1';

// Shared fetch wrapper: turns network failures and non-OK responses into
// one consistent, friendly Error rather than letting fetch's own
// (unhelpful, inconsistent) failure modes leak into the UI. Accepts an
// AbortSignal so callers can cancel a stale request (e.g. the user
// changed currencies again before the first fetch finished).
async function fetchJson(url, signal) {
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error; // not a real failure - let the caller ignore it
    throw new Error('Could not reach the exchange rate service. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'That currency or date range is not available.'
        : `The exchange rate service returned an error (status ${response.status}).`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error('Received an unexpected response from the exchange rate service.');
  }
}

function formatDateParam(date) {
  return date.toISOString().slice(0, 10);
}

// Returns every currency the API supports as [{ code, name }], sorted by
// code - the raw response is a plain { "USD": "United States Dollar", ... }
// map, which isn't ordered or as easy to render a list from.
export async function fetchCurrencies(signal) {
  const data = await fetchJson(`${API_BASE}/currencies`, signal);
  return Object.entries(data)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// Returns the current rate for converting 1 unit of `from` into `to`,
// plus the date it's from. Fetched as a plain 1-unit rate (not with the
// user's amount baked in) so retyping the amount never needs a network
// round-trip - the UI just multiplies locally via convertCurrency().
export async function fetchExchangeRate(from, to, signal) {
  if (from === to) {
    return { rate: 1, date: formatDateParam(new Date()) };
  }
  const data = await fetchJson(`${API_BASE}/latest?from=${from}&to=${to}`, signal);
  return { rate: data.rates[to], date: data.date };
}

// Returns [{ date, value }] for the last `days` days of `from` -> `to`
// rates, oldest first - exactly what the chart needs to plot. Converting
// a currency to itself is always a flat line at 1, which isn't something
// the API can be asked for directly, so that case is synthesized locally
// instead of spending a request on it.
export async function fetchHistoricalRates(from, to, days, signal) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  if (from === to) {
    return [
      { date: formatDateParam(start), value: 1 },
      { date: formatDateParam(end), value: 1 },
    ];
  }

  const data = await fetchJson(
    `${API_BASE}/${formatDateParam(start)}..${formatDateParam(end)}?from=${from}&to=${to}`,
    signal,
  );
  return Object.entries(data.rates)
    .map(([date, rates]) => ({ date, value: rates[to] }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
