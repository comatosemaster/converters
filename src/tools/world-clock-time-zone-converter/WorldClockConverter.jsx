import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import TimeZoneSelect from './TimeZoneSelect.jsx';
import {
  POPULAR_ZONES,
  getAllTimeZones,
  getBrowserTimeZone,
  validateDateTimeInput,
  convertTimeZone,
  swapZones,
  getCurrentTime,
  addClock,
  removeClock,
  MAX_CLOCKS,
} from './timeZoneUtils.js';

const DEFAULT_TO_ZONE = 'UTC';
const POPULAR_ZONE_IDS = POPULAR_ZONES.map((zone) => zone.id);

function pad(n) {
  return String(n).padStart(2, '0');
}

// <input type="date"> / <input type="time"> want "YYYY-MM-DD" / "HH:MM"
// in the browser's OWN local time - a plain formatting concern specific
// to these two HTML controls, not general enough to belong in
// timeZoneUtils.js alongside the zone-aware formatting there.
function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const DAY_BADGE_LABEL = { previous: 'Previous day', next: 'Next day' };

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual time zone math (offsets, DST, day-difference, the one
// genuinely tricky part - interpreting a wall-clock date/time as a moment
// in an arbitrary IANA zone) lives in timeZoneUtils.js, built entirely on
// the browser's own Intl API. This file is just the UI wired up to it,
// plus the single ticking `now` that drives every live display on the
// page (the converter's current-time badges AND every world clock card
// share one interval instead of each owning its own timer).

export default function WorldClockConverter() {
  const zones = useMemo(() => getAllTimeZones(), []);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Captured once at mount (not re-derived every render) so the pristine
  // "nothing changed yet" state stays stable for the unsaved-changes
  // comparison below - see the README's "Warning before losing unsaved
  // work" recipe.
  const [defaultFromZone] = useState(getBrowserTimeZone);
  const [defaultDate] = useState(() => toDateInputValue(new Date()));
  const [defaultTime] = useState(() => toTimeInputValue(new Date()));

  const [fromZone, setFromZone] = useState(defaultFromZone);
  const [toZone, setToZone] = useState(DEFAULT_TO_ZONE);
  const [dateInput, setDateInput] = useState(defaultDate);
  const [timeInput, setTimeInput] = useState(defaultTime);

  const [clocks, setClocks] = useState([]);
  const [copied, setCopied] = useState(false);

  // Re-validates and re-converts on every change - simple, and matches
  // how the other converter tools on this site work (no debouncing,
  // since everything here is local computation with no network involved
  // at all).
  const validation = validateDateTimeInput(dateInput, timeInput);
  let conversion = null;
  let conversionError = '';
  if (validation.ok) {
    try {
      conversion = convertTimeZone(validation.values, fromZone, toZone);
    } catch {
      // Defensive only - every zone offered by TimeZoneSelect already
      // comes from getAllTimeZones(), which only lists zones this
      // browser's own Intl implementation supports.
      conversionError = 'One of the selected time zones is not supported by your browser.';
    }
  }

  const fromCurrent = getCurrentTime(fromZone, now);
  const toCurrent = getCurrentTime(toZone, now);

  function findZone(id) {
    return zones.find((zone) => zone.id === id);
  }

  function handleSwap() {
    const swapped = swapZones(fromZone, toZone);
    setFromZone(swapped.from);
    setToZone(swapped.to);
  }

  function handleClear() {
    setFromZone(defaultFromZone);
    setToZone(DEFAULT_TO_ZONE);
    setDateInput(defaultDate);
    setTimeInput(defaultTime);
    setClocks([]);
    setCopied(false);
  }

  async function handleCopy() {
    if (!conversion) return;
    const fromLabel = findZone(fromZone)?.city ?? fromZone;
    const toLabel = findZone(toZone)?.city ?? toZone;
    const text = `${conversion.from.time} on ${conversion.from.date} in ${fromLabel} (${conversion.from.offset}) = ${conversion.to.time} on ${conversion.to.date} in ${toLabel} (${conversion.to.offset})`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleAddClock(zoneId) {
    setClocks((prev) => addClock(prev, zoneId));
  }

  function handleRemoveClock(id) {
    setClocks((prev) => removeClock(prev, id));
  }

  const hasUnsavedWork =
    fromZone !== defaultFromZone ||
    toZone !== DEFAULT_TO_ZONE ||
    dateInput !== defaultDate ||
    timeInput !== defaultTime ||
    clocks.length > 0;
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="world-clock">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={!conversion}>
          {copied ? 'Copied!' : 'Copy Converted Time'}
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="worldclock-date">Date</label>
          <input id="worldclock-date" type="date" value={dateInput} onChange={(event) => setDateInput(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="worldclock-time">Time</label>
          <input id="worldclock-time" type="time" value={timeInput} onChange={(event) => setTimeInput(event.target.value)} />
        </div>
      </div>
      {validation.error && <p className="field-error">{validation.error}</p>}
      {conversionError && <p className="field-error">{conversionError}</p>}

      <div className="unit-converter-row">
        <TimeZoneSelect
          id="worldclock-from"
          label="From time zone"
          value={fromZone}
          onChange={setFromZone}
          zones={zones}
          popularIds={POPULAR_ZONE_IDS}
          now={now}
        />

        <div className="field unit-swap-field">
          <label htmlFor="worldclock-swap" aria-hidden="true">
            &nbsp;
          </label>
          <button
            id="worldclock-swap"
            type="button"
            className="swap-button unit-swap-button"
            onClick={handleSwap}
            aria-label={`Swap ${fromZone} and ${toZone}`}
            title="Swap time zones"
          >
            ⇄
          </button>
        </div>

        <TimeZoneSelect
          id="worldclock-to"
          label="To time zone"
          value={toZone}
          onChange={setToZone}
          zones={zones}
          popularIds={POPULAR_ZONE_IDS}
          now={now}
        />
      </div>

      <div className="timezone-current-row">
        <div className="timezone-current-item">
          <span className="field-hint">Current time in {findZone(fromZone)?.city ?? fromZone}</span>
          <p className="timezone-current-value">
            {fromCurrent.time} <span className="timezone-current-offset">{fromCurrent.offset}</span>
          </p>
          <p className="field-hint">
            {fromCurrent.date}
            {fromCurrent.isDst && <span className="timezone-dst-badge"> Daylight Saving</span>}
          </p>
        </div>
        <div className="timezone-current-item">
          <span className="field-hint">Current time in {findZone(toZone)?.city ?? toZone}</span>
          <p className="timezone-current-value">
            {toCurrent.time} <span className="timezone-current-offset">{toCurrent.offset}</span>
          </p>
          <p className="field-hint">
            {toCurrent.date}
            {toCurrent.isDst && <span className="timezone-dst-badge"> Daylight Saving</span>}
          </p>
        </div>
      </div>

      {/* validation.error is only falsy-and-empty in the pristine "nothing
          entered yet" case (see validateDateTimeInput) - any partial input
          already has its own specific message above, so this generic hint
          only needs to cover the blank state, not double up on it. */}
      {!validation.ok && !validation.error ? (
        <p className="field-hint">Pick a date and time above to convert it between the two time zones.</p>
      ) : (
        conversion && (
          <div className="unit-result" aria-live="polite">
            <p className="unit-result-value">{conversion.to.time}</p>
            <p className="field-hint">
              {conversion.to.date} · {conversion.to.offset}
              {conversion.to.isDst && <span className="timezone-dst-badge"> Daylight Saving</span>}
              {conversion.dayDifference !== 'same' && (
                <span className={`timezone-day-badge timezone-day-badge-${conversion.dayDifference}`}>
                  {DAY_BADGE_LABEL[conversion.dayDifference]}
                </span>
              )}
            </p>
            <p className="field-hint">
              That's {conversion.from.time} on {conversion.from.date} in {findZone(fromZone)?.city ?? fromZone} (
              {conversion.from.offset})
              {conversion.from.isDst && <span className="timezone-dst-badge"> Daylight Saving</span>}
            </p>
          </div>
        )
      )}

      <div className="field">
        <div className="field-header">
          <label>World clocks</label>
        </div>
        <TimeZoneSelect
          id="worldclock-add"
          label="Add a clock"
          value=""
          onChange={handleAddClock}
          zones={zones}
          popularIds={POPULAR_ZONE_IDS}
          now={now}
        />
        {clocks.length >= MAX_CLOCKS && <p className="field-hint">You've pinned the maximum of {MAX_CLOCKS} clocks.</p>}

        {clocks.length > 0 && (
          <div className="timezone-clocks-grid">
            {clocks.map((clock) => {
              const zone = findZone(clock.timeZone);
              const current = getCurrentTime(clock.timeZone, now);
              return (
                <div key={clock.id} className="timezone-clock-card">
                  <div className="timezone-clock-card-header">
                    <div>
                      <p className="timezone-clock-city">{zone?.city ?? clock.timeZone}</p>
                      <p className="field-hint">{[zone?.country, zone?.region].filter(Boolean).join(' · ') || clock.timeZone}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveClock(clock.id)}
                      aria-label={`Remove ${zone?.city ?? clock.timeZone} clock`}
                    >
                      ✕
                    </button>
                  </div>
                  <p className="timezone-clock-time">{current.time}</p>
                  <p className="field-hint">
                    {current.date} · {current.offset}
                  </p>
                  {current.isDst && <span className="timezone-dst-badge">Daylight Saving</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <article className="tool-article">
        <p>
          Whether you're scheduling a call across three time zones, checking whether it's too late
          to text someone in Tokyo, or just curious what time it is in Tbilisi right now, this tool
          converts dates and times between time zones and keeps a board of live world clocks -
          entirely in your browser, using the same Intl time zone data your operating system
          already ships with.
        </p>

        <h2>How time zones work</h2>
        <p>
          The Earth is divided into roughly two dozen time zones, each offset from Coordinated
          Universal Time (UTC) by a whole or half-hour amount - though a handful, like India
          (UTC+5:30) and Nepal (UTC+5:45), use unusual fractional offsets. A time zone isn't just
          an offset, though: it's tied to a real geographic region (identified by IANA names like{' '}
          <code>Europe/London</code> or <code>Asia/Tbilisi</code>) because that region's offset can
          itself change over the year if it observes Daylight Saving Time.
        </p>

        <h2>UTC explained</h2>
        <p>
          UTC (Coordinated Universal Time) is the time standard every other time zone is defined
          relative to - it doesn't observe Daylight Saving Time and never changes, which is exactly
          why it's the reference point used throughout this tool's underlying math. "GMT" (Greenwich
          Mean Time) is effectively the same thing in practice, though GMT technically refers to
          London's time zone specifically, which happens to match UTC for most of the year.
        </p>

        <h2>Daylight Saving Time explained</h2>
        <p>
          Daylight Saving Time (DST) is the practice of moving clocks forward by an hour (usually in
          spring) to shift an hour of daylight from early morning into the evening, then back again
          (usually in autumn). Not every country observes it - most of Asia, and Japan and China
          specifically, do not - and the ones that do don't all switch on the same dates, which is
          the single biggest reason a time difference between two cities can quietly shift by an
          hour depending on the time of year. The "Daylight Saving" badge shown throughout this tool
          reflects whether a zone is currently in its DST offset, computed live from your browser's
          own time zone data.
        </p>

        <h2>Common time zone conversions</h2>
        <ul>
          <li><strong>New York → London</strong> - US Eastern Time to UK time, typically 5 hours apart (4 during UK/US daylight saving overlap).</li>
          <li><strong>London → Tokyo</strong> - typically 9 hours apart, with Japan observing no Daylight Saving Time at all.</li>
          <li><strong>Los Angeles → New York</strong> - US Pacific to US Eastern, a consistent 3-hour difference year-round since both observe DST on the same dates.</li>
          <li><strong>Tbilisi → Dubai</strong> - Georgia to the UAE, typically a 1-hour difference; Georgia does not observe Daylight Saving Time.</li>
          <li><strong>Sydney → Singapore</strong> - typically 2-3 hours apart depending on the Australian DST season (Singapore never observes it).</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why does a time difference sometimes change during the year?</h3>
          <p>
            Because one or both zones in the pair observe Daylight Saving Time on their own
            schedule - the underlying UTC offset for that zone genuinely shifts by an hour twice a
            year, which changes the gap between it and any zone that doesn't move with it.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does the "Next day" / "Previous day" badge mean?</h3>
          <p>
            It shows when converting a time pushes the CALENDAR DATE forward or back a day in the
            other zone - for example, 11 PM in Los Angeles is already the next afternoon in Tokyo,
            even though only a handful of hours have "passed."
          </p>
        </div>
        <div className="faq-item">
          <h3>How accurate is the Daylight Saving Time detection?</h3>
          <p>
            It's read directly from your browser's own Intl time zone database (the same data your
            operating system uses for its own clock), not a hardcoded set of DST rules - so it stays
            correct even as countries change their DST policies over time, as long as your browser
            is reasonably up to date.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I convert a time in the past or future, not just right now?</h3>
          <p>
            Yes - the date and time picker accepts any date, and the conversion (including which
            zone is in Daylight Saving Time) is calculated correctly for THAT date, not today's.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my selected date, time, or location sent anywhere?</h3>
          <p>
            No - every conversion, live clock, and DST check runs locally using your browser's own
            Intl API; nothing is ever uploaded.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/everyday">Everyday tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
