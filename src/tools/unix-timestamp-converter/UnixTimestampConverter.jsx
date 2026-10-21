import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHydrated } from '../../hooks/useHydrated.js';
import TimeZoneSelect from '../world-clock-time-zone-converter/TimeZoneSelect.jsx';
import { POPULAR_ZONES, getAllTimeZones, getBrowserTimeZone } from '../world-clock-time-zone-converter/timeZoneUtils.js';
import { describe, parseInput, unitLabel, wallTimeNow, wallTimeToMs } from './timestampUtils.js';

const POPULAR_ZONE_IDS = POPULAR_ZONES.map((zone) => zone.id);

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The page is prerendered at build time, when "now" and "your time zone"
// mean the build server's. So everything that depends on them starts as a
// placeholder and is filled in once the page is running in the browser
// (see useHydrated) - otherwise the server's HTML and the browser's first
// render would disagree.

export default function UnixTimestampConverter() {
  const hydrated = useHydrated();
  const zones = useMemo(() => getAllTimeZones(), []);

  const [now, setNow] = useState(() => new Date(0));
  const [timeZone, setTimeZone] = useState('UTC');
  const [input, setInput] = useState('');
  const [wallDate, setWallDate] = useState('');
  const [wallTime, setWallTime] = useState('');
  const [copied, setCopied] = useState('');

  // Once in the browser: start the clock, switch to the visitor's own time
  // zone, and pre-fill the date picker with the current moment.
  useEffect(() => {
    const zone = getBrowserTimeZone();
    const start = Date.now();
    setNow(new Date(start));
    setTimeZone(zone);
    const wall = wallTimeNow(zone, start);
    setWallDate(wall.date);
    setWallTime(wall.time);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  async function copy(text, key) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  }

  const nowMs = now.getTime();
  const parsed = parseInput(input);
  const rows = parsed.ok ? describe(parsed.ms, timeZone, nowMs) : [];
  const wallMs = wallDate ? wallTimeToMs(wallDate, wallTime, timeZone) : null;

  function copyButton(text, id) {
    return (
      <button type="button" className="copy-button" onClick={() => copy(text, id)}>
        {copied === id ? 'Copied!' : 'Copy'}
      </button>
    );
  }

  return (
    <div className="unix-timestamp-converter">
      <section className="ts-now" aria-label="Current Unix time">
        <div className="ts-now-item">
          <span className="ts-now-label">Current Unix time (seconds)</span>
          <code className="ts-now-value">{hydrated ? Math.floor(nowMs / 1000) : '—'}</code>
          {hydrated && copyButton(String(Math.floor(nowMs / 1000)), 'now-s')}
        </div>
        <div className="ts-now-item">
          <span className="ts-now-label">Milliseconds</span>
          <code className="ts-now-value">{hydrated ? nowMs : '—'}</code>
          {hydrated && copyButton(String(nowMs), 'now-ms')}
        </div>
      </section>

      <TimeZoneSelect
        id="ts-zone"
        label="Time zone for displaying and entering dates"
        value={timeZone}
        onChange={setTimeZone}
        zones={zones}
        popularIds={POPULAR_ZONE_IDS}
        now={now}
      />

      <h2 className="pdf-section-heading">Timestamp &rarr; date</h2>
      <div className="field">
        <label htmlFor="ts-input">Unix timestamp or date</label>
        <div className="pdf-password-row">
          <input
            id="ts-input"
            type="text"
            inputMode="text"
            value={input}
            spellCheck={false}
            autoComplete="off"
            placeholder="e.g. 1761060600, 1761060600000, or 2026-10-21T15:30:00Z"
            onChange={(event) => setInput(event.target.value)}
          />
          <button
            type="button"
            className="ghost-button"
            onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}
            disabled={!hydrated}
          >
            Now
          </button>
        </div>
        {parsed.ok && (
          <p className="field-hint">
            Read as {unitLabel(parsed.unit)}
            {parsed.unit !== 'date' && ' (detected from the number of digits)'}.
          </p>
        )}
        {!parsed.ok && parsed.error && <p className="field-error">{parsed.error}</p>}
      </div>

      {rows.length > 0 && (
        <dl className="ts-results">
          {rows.map(([label, value]) => (
            <div key={label} className="ts-row">
              <dt>{label}</dt>
              <dd>
                <code>{value}</code>
                {copyButton(value, label)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <h2 className="pdf-section-heading">Date &rarr; timestamp</h2>
      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="ts-date">Date</label>
          <input id="ts-date" type="date" value={wallDate} onChange={(event) => setWallDate(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ts-time">Time ({timeZone})</label>
          <input id="ts-time" type="time" step={1} value={wallTime} onChange={(event) => setWallTime(event.target.value)} />
        </div>
      </div>
      {wallMs !== null && Number.isFinite(wallMs) && (
        <dl className="ts-results">
          <div className="ts-row">
            <dt>Unix time (seconds)</dt>
            <dd>
              <code>{Math.floor(wallMs / 1000)}</code>
              {copyButton(String(Math.floor(wallMs / 1000)), 'wall-s')}
            </dd>
          </div>
          <div className="ts-row">
            <dt>Milliseconds</dt>
            <dd>
              <code>{wallMs}</code>
              {copyButton(String(wallMs), 'wall-ms')}
            </dd>
          </div>
          <div className="ts-row">
            <dt>ISO 8601 (UTC)</dt>
            <dd>
              <code>{new Date(wallMs).toISOString()}</code>
              {copyButton(new Date(wallMs).toISOString(), 'wall-iso')}
            </dd>
          </div>
        </dl>
      )}

      <article className="tool-article">
        <p>
          A Unix timestamp counts the seconds since 00:00:00 UTC on 1 January 1970 - the
          &quot;Unix epoch&quot;. Computers use it because a single number is easy to store, compare
          and sort, and it means the same moment everywhere on Earth. This converter turns
          timestamps into readable dates in any time zone, and dates back into timestamps.
        </p>

        <h2>Seconds, milliseconds, or more?</h2>
        <p>
          Different systems count in different units: Unix and most databases use seconds
          (<code>1761060600</code>, 10 digits), JavaScript and Java use milliseconds (13 digits), and
          some logging and tracing tools use microseconds (16) or nanoseconds (19). Paste any of
          them - the unit is detected from the number of digits and shown under the box.
        </p>

        <h2>Time zones and daylight saving</h2>
        <p>
          A timestamp itself has no time zone; only its display does. Choose any zone to see the
          local date and time there, with the correct offset for that date - including daylight
          saving changes. When converting a date to a timestamp, the date and time you enter are
          treated as local time in the selected zone.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>What is the year 2038 problem?</h3>
          <p>Older systems store timestamps as signed 32-bit integers, which run out at 2,147,483,647 seconds - 03:14:07 UTC on 19 January 2038. After that they wrap around to 1901. Modern systems use 64-bit values, which last for billions of years; this tool handles dates far beyond 2038.</p>
        </div>
        <div className="faq-item">
          <h3>Can timestamps be negative?</h3>
          <p>Yes - negative values are moments before 1970. For example, <code>-86400</code> is 31 December 1969.</p>
        </div>
        <div className="faq-item">
          <h3>Do Unix timestamps include leap seconds?</h3>
          <p>No. Unix time treats every day as exactly 86,400 seconds, so it ignores the leap seconds occasionally added to UTC. That&apos;s why it can be converted to dates with simple arithmetic.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Compare clocks across cities with the{' '}
          <Link to="/tool/world-clock-time-zone-converter">World Clock &amp; Time Zone Converter</Link>,
          or browse all <Link to="/category/developer">Developer tools</Link>.
        </p>
      </article>
    </div>
  );
}
