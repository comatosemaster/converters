import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { filterTimeZones, formatUtcOffset } from './timeZoneUtils.js';

// A searchable time zone dropdown - the same open/search/arrow-key/
// Enter/Escape combobox model as CurrencySelect.jsx (itself modeled on
// the site's ⌘K command palette), adapted to search across city,
// country, region, AND raw IANA id, and to show each zone's current UTC
// offset alongside it (reads off the shared `now` the parent tool is
// already ticking, so no extra timer lives in here).

export default function TimeZoneSelect({ id, label, value, onChange, zones, popularIds = [], now, disabled = false }) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = zones.find((zone) => zone.id === value);

  const popular = useMemo(
    () => popularIds.map((zoneId) => zones.find((zone) => zone.id === zoneId)).filter(Boolean),
    [zones, popularIds],
  );

  const listed = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const popularIdSet = new Set(popular.map((zone) => zone.id));
      return [...popular, ...zones.filter((zone) => !popularIdSet.has(zone.id))];
    }
    return filterTimeZones(zones, q);
  }, [zones, popular, query]);

  // The list can hold ~400 rows, each needing its own Intl offset
  // calculation - recomputing all of them on every second's tick (while
  // the panel merely happens to be open) would be pure waste, since an
  // offset barely ever changes minute-to-minute. Freezing the reference
  // instant to "whenever the panel was opened" keeps offsets accurate
  // without recalculating 400 of them every second.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const listReferenceDate = useMemo(() => now, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function selectZone(zoneId) {
    onChange(zoneId);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (listed.length ? (prev + 1) % listed.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (listed.length ? (prev - 1 + listed.length) % listed.length : 0));
    } else if (event.key === 'Enter' && listed[activeIndex]) {
      event.preventDefault();
      selectZone(listed[activeIndex].id);
    }
  }

  return (
    <div className="field currency-select" ref={containerRef}>
      <label htmlFor={id}>{label}</label>
      <button
        type="button"
        id={id}
        className="currency-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="currency-select-code">{selected?.city ?? value}</span>
        <span className="currency-select-name">
          {selected ? [selected.country, selected.region].filter(Boolean).join(' · ') || selected.id : 'Select a time zone'}
        </span>
        {selected && <span className="timezone-select-offset">{formatUtcOffset(now, selected.id)}</span>}
        <ChevronDown size={16} aria-hidden="true" className="currency-select-chevron" />
      </button>

      {open && !disabled && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div className="currency-select-panel" onKeyDown={handleKeyDown}>
          <div className="currency-select-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search city, country, or time zone…"
              aria-label={`Search ${label.toLowerCase()}`}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          <ul className="currency-select-list" role="listbox" aria-label={label}>
            {listed.length === 0 ? (
              <li className="currency-select-empty">No time zones match “{query}”.</li>
            ) : (
              listed.map((zone, index) => (
                <li key={zone.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={zone.id === value}
                    className={index === activeIndex ? 'currency-select-option active' : 'currency-select-option'}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectZone(zone.id)}
                  >
                    <span className="currency-select-option-code">{zone.city}</span>
                    <span className="currency-select-option-name">
                      {[zone.country, zone.region].filter(Boolean).join(' · ') || zone.id}
                    </span>
                    <span className="timezone-select-offset">{formatUtcOffset(listReferenceDate, zone.id)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
