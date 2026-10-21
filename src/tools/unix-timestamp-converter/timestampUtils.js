// -----------------------------------------------------------------------
// UNIX TIMESTAMP LOGIC - no React. Time-zone math is shared with the World
// Clock tool (timeZoneUtils.js), so both tools always agree on offsets and
// daylight saving.
// -----------------------------------------------------------------------

import {
  formatZonedDateTime,
  getTimeZoneOffsetMinutes,
  zonedTimeToUtc,
} from '../world-clock-time-zone-converter/timeZoneUtils.js';

// The largest moment a JavaScript Date can represent: ±100,000,000 days
// around 1970 (roughly the years -271,821 to 275,760).
const MAX_MS = 8.64e15;

const UNIT_LABELS = {
  s: 'seconds',
  ms: 'milliseconds',
  us: 'microseconds',
  ns: 'nanoseconds',
  date: 'date string',
};

// Reads either a numeric timestamp or a date string. A bare number's unit
// is guessed from its size, the same way most developer tools do: today is
// about 1.8 billion seconds, 1.8 trillion milliseconds, and so on, so each
// unit lands in its own range for any date between 1973 and 5138.
// Returns { ok: true, ms, unit } or { ok: false, error }.
export function parseInput(raw) {
  const text = raw.trim().replace(/[_,\s](?=\d)/g, '');
  if (!text) return { ok: false, error: '' };

  if (/^[-+]?\d+(\.\d+)?$/.test(text)) {
    const value = Number(text);
    const digits = Math.abs(Math.trunc(value)).toString().length;
    let unit = 's';
    if (digits > 16) unit = 'ns';
    else if (digits > 13) unit = 'us';
    else if (digits > 11) unit = 'ms';
    const divisor = { s: 1e-3, ms: 1, us: 1e3, ns: 1e6 }[unit];
    const ms = value / divisor;
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_MS) {
      return { ok: false, error: 'That timestamp is too far from 1970 to be a real date.' };
    }
    return { ok: true, ms, unit };
  }

  // Not a number: accept ISO 8601 ("2026-10-21T15:30:00Z"), plain dates
  // ("2026-10-21", read as midnight UTC per the ISO standard) and
  // RFC 2822 / HTTP dates ("Wed, 21 Oct 2026 15:30:00 GMT").
  const parsed = Date.parse(raw.trim());
  if (Number.isNaN(parsed)) {
    return {
      ok: false,
      error: 'Enter a Unix timestamp (like 1761060600) or a date (like 2026-10-21T15:30:00Z).',
    };
  }
  return { ok: true, ms: parsed, unit: 'date' };
}

export function unitLabel(unit) {
  return UNIT_LABELS[unit] ?? unit;
}

// "+04:00", "-05:30", or "Z" for UTC - the ISO 8601 offset suffix.
function isoOffset(date, timeZone) {
  const minutes = getTimeZoneOffsetMinutes(date, timeZone);
  if (minutes === 0) return 'Z';
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function relative(ms, nowMs) {
  const seconds = Math.round((ms - nowMs) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(seconds / (86400 * 30.44)), 'month');
  return rtf.format(Math.round(seconds / (86400 * 365.25)), 'year');
}

// Every representation of one instant, as [label, value] rows.
export function describe(ms, timeZone, nowMs) {
  const date = new Date(ms);
  const zoned = formatZonedDateTime(date, timeZone);
  // Always 0-999, also before 1970 (-1 ms is 23:59:59.999 the day before).
  const millis = String(((Math.floor(ms) % 1000) + 1000) % 1000).padStart(3, '0');
  const isoLocal =
    `${String(zoned.year).padStart(4, '0')}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')}` +
    `T${zoned.time}.${millis}${isoOffset(date, timeZone)}`;
  const seconds = ms / 1000;
  return [
    ['Unix time (seconds)', Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(3)],
    ['Milliseconds', String(Math.trunc(ms))],
    [`Date & time (${timeZone})`, `${zoned.date}, ${zoned.time}`],
    ['ISO 8601 (UTC)', date.toISOString()],
    [`ISO 8601 (${timeZone})`, isoLocal],
    ['RFC 2822 / HTTP date', date.toUTCString()],
    ['Relative', relative(ms, nowMs)],
  ];
}

// Date + time typed as wall-clock time in `timeZone` -> milliseconds.
export function wallTimeToMs(dateText, timeText, timeZone) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText || '00:00');
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute, second = 0] = timeMatch.map((v) => Number(v ?? 0));
  const instant = zonedTimeToUtc({ year, month, day, hour, minute }, timeZone);
  return instant.getTime() + second * 1000;
}

// Today's date and time in `timeZone`, for pre-filling the date inputs.
export function wallTimeNow(timeZone, nowMs) {
  const zoned = formatZonedDateTime(new Date(nowMs), timeZone);
  return {
    date: `${zoned.year}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')}`,
    time: zoned.time,
  };
}
