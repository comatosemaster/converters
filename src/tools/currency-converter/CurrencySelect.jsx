import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

// A searchable currency dropdown: a button showing the current selection
// that opens a small panel with a search box and a keyboard-navigable
// list - the same open/search/arrow-key/Enter/Escape model as the site's
// ⌘K command palette (see CommandPalette.jsx), just scoped to one field
// instead of a full-page overlay.

export default function CurrencySelect({ id, label, value, onChange, currencies, popularCodes = [], disabled = false }) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = currencies.find((currency) => currency.code === value);

  const popular = useMemo(
    () => popularCodes.map((code) => currencies.find((currency) => currency.code === code)).filter(Boolean),
    [currencies, popularCodes],
  );

  // While not searching, popular currencies are pinned at the top
  // (followed by everything else); typing a query switches to a plain
  // filtered list, since "popular first" stops being useful once the
  // user has already narrowed things down themselves.
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const popularCodeSet = new Set(popular.map((currency) => currency.code));
      return [...popular, ...currencies.filter((currency) => !popularCodeSet.has(currency.code))];
    }
    return currencies.filter(
      (currency) => currency.code.toLowerCase().includes(q) || currency.name.toLowerCase().includes(q),
    );
  }, [currencies, popular, query]);

  // Resets to a clean state each time the panel opens, and moves focus
  // into the search box so the user can just start typing.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Closes on a click landing outside the field entirely - clicks on the
  // trigger button itself are handled by its own onClick toggle instead.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function selectCurrency(code) {
    onChange(code);
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
      selectCurrency(listed[activeIndex].code);
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
        <span className="currency-select-code">{selected?.code ?? value}</span>
        <span className="currency-select-name">{selected?.name ?? 'Select a currency'}</span>
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
              placeholder="Search currencies…"
              aria-label={`Search ${label.toLowerCase()}`}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          <ul className="currency-select-list" role="listbox" aria-label={label}>
            {listed.length === 0 ? (
              <li className="currency-select-empty">No currencies match “{query}”.</li>
            ) : (
              listed.map((currency, index) => (
                <li key={currency.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={currency.code === value}
                    className={index === activeIndex ? 'currency-select-option active' : 'currency-select-option'}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectCurrency(currency.code)}
                  >
                    <span className="currency-select-option-code">{currency.code}</span>
                    <span className="currency-select-option-name">{currency.name}</span>
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
