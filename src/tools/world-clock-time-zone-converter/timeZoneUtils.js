// -----------------------------------------------------------------------
// TIME ZONE LOGIC - no React, no DOM. Pure functions built entirely on
// the browser's own Intl API (Intl.DateTimeFormat, Intl.supportedValuesOf)
// - no external time service, no timezone-data dependency. Pure functions
// only, so this file can be read (or reused) completely independently of
// the UI in WorldClockConverter.jsx.
// -----------------------------------------------------------------------

// A curated set of well-known zones, used to (a) seed the "quick add"
// suggestions and (b) attach a real country name to the search index -
// Intl has no built-in "which country is this IANA zone in" lookup, so
// the full zone list below only ever gets a city/region, not a country,
// unless it's one of these.
export const POPULAR_ZONES = [
  { id: 'UTC', city: 'UTC', country: 'Coordinated Universal Time' },
  { id: 'Europe/London', city: 'London', country: 'United Kingdom' },
  { id: 'Europe/Paris', city: 'Paris', country: 'France' },
  { id: 'Europe/Berlin', city: 'Berlin', country: 'Germany' },
  { id: 'Asia/Tbilisi', city: 'Tbilisi', country: 'Georgia' },
  { id: 'Asia/Dubai', city: 'Dubai', country: 'United Arab Emirates' },
  { id: 'America/New_York', city: 'New York', country: 'United States' },
  { id: 'America/Chicago', city: 'Chicago', country: 'United States' },
  { id: 'America/Los_Angeles', city: 'Los Angeles', country: 'United States' },
  { id: 'Asia/Tokyo', city: 'Tokyo', country: 'Japan' },
  { id: 'Australia/Sydney', city: 'Sydney', country: 'Australia' },
  { id: 'Asia/Singapore', city: 'Singapore', country: 'Singapore' },
  { id: 'Asia/Hong_Kong', city: 'Hong Kong', country: 'Hong Kong' },
];

// A small fallback used only if the runtime doesn't implement
// Intl.supportedValuesOf (Safari < 15.4, and other older engines) -
// covers the tool's own quick-add list so it still works, just without
// the full ~400-zone search index. See the "browser compatibility" note
// in this project's summary for details.
const FALLBACK_ZONE_IDS = POPULAR_ZONES.map((zone) => zone.id);

function deriveCityFromId(id) {
  const lastSegment = id.split('/').pop();
  return lastSegment.replace(/_/g, ' ');
}

function deriveRegionFromId(id) {
  const segments = id.split('/');
  return segments.length > 1 ? segments[0].replace(/_/g, ' ') : segments[0];
}

// Every zone the browser supports, as { id, city, region, country }. The
// `country` field is only populated for POPULAR_ZONES entries - see the
// comment above. Built once (not on every render) since
// Intl.supportedValuesOf('timeZone') never changes during a session.
export function getAllTimeZones() {
  const ids =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_ZONE_IDS;
  const popularById = new Map(POPULAR_ZONES.map((zone) => [zone.id, zone]));

  return ids
    .map((id) => {
      const popular = popularById.get(id);
      return {
        id,
        city: popular?.city ?? deriveCityFromId(id),
        region: deriveRegionFromId(id),
        country: popular?.country ?? '',
      };
    })
    .sort((a, b) => a.city.localeCompare(b.city));
}

// The visitor's own zone, used as the converter's default "From" - a
// nicer starting point than an arbitrary hardcoded zone, and still a
// fixed value for the lifetime of the module (captured once, not
// re-detected on every render) so pristine-state comparisons stay stable.
export function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

// Filters a zone list by city, region, country, or raw IANA id - the
// same "search several fields, case-insensitive substring" shape used by
// searchTools() in the site's tool registry and by CurrencySelect.
export function filterTimeZones(zones, query) {
  const q = query.trim().toLowerCase();
  if (!q) return zones;
  return zones.filter(
    (zone) =>
      zone.city.toLowerCase().includes(q) ||
      zone.region.toLowerCase().includes(q) ||
      zone.country.toLowerCase().includes(q) ||
      zone.id.toLowerCase().includes(q),
  );
}

// --- The core primitive: a zone's UTC offset at a specific instant --------------

// Returns the zone's offset from UTC, in minutes, at the given instant -
// positive for zones ahead of UTC (e.g. +240 for UTC+4), negative for
// zones behind it. This is the standard Intl-only technique: format the
// instant's wall-clock time IN that zone, re-interpret those same
// digits as if they were UTC, and diff the two timestamps. It correctly
// handles fractional offsets (India's +5:30, Nepal's +5:45) without any
// string-parsing of GMT+/-N labels.
function getTimeZoneOffsetMinutes(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  // Midnight is sometimes reported as hour "24" rather than "00".
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  // Real IANA offsets are always whole minutes - rounding here absorbs
  // the sub-second noise `date`'s own milliseconds would otherwise leak
  // in as a fractional minute (e.g. "UTC-0:00.004" for plain UTC).
  return Math.round((asUtc - date.getTime()) / 60000);
}

// --- Validation -----------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

// Checks a <input type="date"> + <input type="time"> pair are both
// present and represent a real calendar date/time - never throws, so the
// UI never needs a try/catch of its own. Returns
// `{ ok: true, values: { year, month, day, hour, minute } }` or
// `{ ok: false, error }`.
export function validateDateTimeInput(dateStr, timeStr) {
  if (!dateStr && !timeStr) return { ok: false, error: '' }; // empty isn't an "error" to display
  if (!dateStr) return { ok: false, error: 'Pick a date.' };
  if (!timeStr) return { ok: false, error: 'Pick a time.' };
  if (!DATE_PATTERN.test(dateStr) || !TIME_PATTERN.test(timeStr)) {
    return { ok: false, error: 'That date or time is not in a recognized format.' };
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Date.UTC() silently "rolls over" an invalid date (e.g. day 31 in a
  // 30-day month becomes day 1 of the next month) instead of failing -
  // reading the fields back and comparing catches that roll-over as the
  // invalid input it actually was.
  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const isValid =
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day &&
    asUtc.getUTCHours() === hour &&
    asUtc.getUTCMinutes() === minute;

  if (!isValid) return { ok: false, error: 'That date does not exist.' };
  return { ok: true, values: { year, month, day, hour, minute } };
}

// Confirms a zone id is one this browser's Intl implementation actually
// accepts - defensive validation for the "unsupported time zone" case
// called out in this tool's spec. In normal use every zone the UI offers
// already comes from getAllTimeZones(), so this should never fail; it
// exists as a safety net rather than a path users hit in practice.
export function isSupportedTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

// --- Conversion -------------------------------------------------------------------

// Interprets { year, month, day, hour, minute } as WALL-CLOCK time in
// `timeZone` and returns the real UTC instant (a Date) it corresponds
// to. This is the one piece Intl doesn't provide directly - everything
// else (formatting that instant back out in any zone, offsets, DST) can
// be read straight off a plain Date + Intl.DateTimeFormat once this
// instant is known.
export function zonedTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  // One correction pass using the offset AT the naive guess - accurate
  // for this tool's purpose (converting a chosen date/time, not
  // resolving the ambiguous hour that exists during a DST transition
  // itself, which is a fundamentally ambiguous input no library can
  // "solve" without asking the user which occurrence they meant).
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offsetMinutes * 60000);
}

// --- Formatting -------------------------------------------------------------------

// The one place every "how does a moment look in this zone" question is
// answered - time, plus a human-readable date, plus the numeric
// year/month/day used for day-difference math. Two separate
// Intl.DateTimeFormat calls on purpose: `month: 'long'` (for a readable
// "August 6, 2026") returns a MONTH NAME, not a number, so a single
// formatter can't serve both the display string and the numeric fields -
// asking for numeric month separately is what keeps getDayDifference()'s
// arithmetic correct.
export function formatZonedDateTime(date, timeZone) {
  const numericFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const part of numericFormatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  // Midnight is sometimes reported as hour "24" rather than "00".
  const hour = parts.hour === '24' ? '00' : parts.hour;

  const labelFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    time: `${hour}:${parts.minute}:${parts.second}`,
    date: labelFormatter.format(date),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

// "UTC+4", "UTC-5:30" - built from the raw offset-in-minutes rather than
// parsed out of Intl's own "GMT+4" label, so it's exact even for the
// fractional-hour zones (India, Nepal, parts of Australia).
export function formatUtcOffset(date, timeZone) {
  const minutes = getTimeZoneOffsetMinutes(date, timeZone);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return mins === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(mins).padStart(2, '0')}`;
}

// A zone is "currently in DST" if its offset at this instant is the
// LARGER of its January and July offsets for the same year (DST always
// moves clocks forward relative to standard time, in either
// hemisphere) - and only if those two reference offsets actually
// differ, since a zone that never observes DST would otherwise
// (nonsensically) always match its own "larger" offset.
export function isDaylightSavingActive(date, timeZone) {
  const year = date.getUTCFullYear();
  const januaryOffset = getTimeZoneOffsetMinutes(new Date(Date.UTC(year, 0, 1)), timeZone);
  const julyOffset = getTimeZoneOffsetMinutes(new Date(Date.UTC(year, 6, 1)), timeZone);
  if (januaryOffset === julyOffset) return false; // this zone never observes DST

  const currentOffset = getTimeZoneOffsetMinutes(date, timeZone);
  return currentOffset === Math.max(januaryOffset, julyOffset);
}

// Compares the CALENDAR DATE of the same instant as seen in two
// different zones (not the offsets themselves) - robust regardless of
// DST, since it only ever looks at what date each zone's wall clock
// reads.
export function getDayDifference(date, fromZone, toZone) {
  const fromParts = formatZonedDateTime(date, fromZone);
  const toParts = formatZonedDateTime(date, toZone);
  const fromMidnight = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toMidnight = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  const diffDays = Math.round((toMidnight - fromMidnight) / 86400000);

  if (diffDays === 0) return 'same';
  return diffDays > 0 ? 'next' : 'previous';
}

// The converter's main entry point: interprets the wall-clock values as
// a moment in `fromZone`, then reports everything the UI needs about
// that SAME instant as seen from both `fromZone` and `toZone` - time,
// date, UTC offset, DST status, and how the calendar date shifts between
// them. Every other formatting/offset/DST helper above exists so this
// one function can stay a simple composition of them.
export function convertTimeZone(dateTimeValues, fromZone, toZone) {
  const instant = zonedTimeToUtc(dateTimeValues, fromZone);
  return {
    instant,
    from: {
      ...formatZonedDateTime(instant, fromZone),
      offset: formatUtcOffset(instant, fromZone),
      isDst: isDaylightSavingActive(instant, fromZone),
    },
    to: {
      ...formatZonedDateTime(instant, toZone),
      offset: formatUtcOffset(instant, toZone),
      isDst: isDaylightSavingActive(instant, toZone),
    },
    dayDifference: getDayDifference(instant, fromZone, toZone),
  };
}

export function swapZones(from, to) {
  return { from: to, to: from };
}

// Everything needed to display ONE zone's current state at `date`
// (defaults to right now) - used for the live "current time in From/To"
// badges and every world-clock card, all ticking off the same shared
// `now` the component already re-renders on every second.
export function getCurrentTime(timeZone, date = new Date()) {
  return {
    ...formatZonedDateTime(date, timeZone),
    offset: formatUtcOffset(date, timeZone),
    isDst: isDaylightSavingActive(date, timeZone),
  };
}

// --- Multiple world clocks --------------------------------------------------------

const MAX_CLOCKS = 12;

// Adds a clock for `timeZone` unless it's already pinned or the board is
// full - returns the SAME array reference when nothing changed, so
// callers can tell a no-op add apart from a real one if they need to.
export function addClock(clocks, timeZone) {
  if (clocks.some((clock) => clock.timeZone === timeZone) || clocks.length >= MAX_CLOCKS) return clocks;
  return [...clocks, { id: `${timeZone}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timeZone }];
}

export function removeClock(clocks, id) {
  return clocks.filter((clock) => clock.id !== id);
}

export const MAX_CLOCKS_REACHED_MESSAGE = `You can pin up to ${MAX_CLOCKS} clocks at once.`;
export { MAX_CLOCKS };
