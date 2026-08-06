import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, ArrowUpDown } from 'lucide-react';
import { searchTools, getCategoryById } from '../tools/registry.js';
import Highlight from './Highlight.jsx';

// A ⌘K / Ctrl+K command palette for jumping to any tool by name, keyword,
// or category - the fastest path to a tool once the site has more than a
// handful of them.
//
// Layout.jsx owns the open/close state (so the header button can open it
// too) and renders this once for the whole site.

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Remembers what was focused before opening, so closing returns focus
  // there instead of dumping the user back at the top of the page.
  const previousFocusRef = useRef(null);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => searchTools(query), [query]);

  // Reset to a clean state each time it opens, and move focus into the
  // input so you can just start typing.
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      setQuery('');
      setActiveIndex(0);
      // Focus after paint so the element definitely exists.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      previousFocusRef.current?.focus?.();
    }
  }, [open]);

  // Any new query invalidates the current highlight position.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keep the highlighted row scrolled into view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const activeEl = listRef.current?.querySelector('.palette-item.active');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Stop the page behind the palette from scrolling while it's open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  function goTo(tool) {
    onClose();
    navigate(`/tool/${tool.id}`);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      goTo(results[activeIndex]);
    }
  }

  return (
    <div
      className="palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        // Only close on clicks landing on the backdrop itself, not on
        // clicks that started inside the panel.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search tools"
        onKeyDown={handleKeyDown}
      >
        <div className="palette-search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools…"
            aria-label="Search tools"
            aria-controls="palette-results"
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        <div className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {results.length === 0 ? (
            <p className="palette-empty">
              No tools match “{query}”.
              <br />
              Try a format name like “png”, “json”, or “qr”.
            </p>
          ) : (
            <>
              <div className="palette-group-label">
                {query ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'All tools'}
              </div>
              {results.map((tool, index) => {
                const ToolIcon = tool.icon;
                const category = getCategoryById(tool.category);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? 'palette-item active' : 'palette-item'}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => goTo(tool)}
                  >
                    <span className="palette-item-icon" aria-hidden="true">
                      <ToolIcon size={17} />
                    </span>
                    <span className="palette-item-text">
                      <span className="palette-item-name">
                        <Highlight text={tool.name} query={query} />
                      </span>
                      <span className="palette-item-meta">{category?.name}</span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="palette-footer">
          <span>
            <ArrowUpDown size={12} aria-hidden="true" /> Navigate
          </span>
          <span>
            <CornerDownLeft size={12} aria-hidden="true" /> Open
          </span>
          <span>
            <kbd className="kbd">Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
