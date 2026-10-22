import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Lightbulb, X } from 'lucide-react';
import { getToolById, getToolsByCategory } from '../tools/registry.js';

// The persistent tool navigator: every category, expandable to the tools
// inside it. Built entirely from the registry (getToolsByCategory), so a
// new tool appears here the moment it's registered - there is no second
// list of categories or tools anywhere in the UI.
//
// One component serves both layouts. On desktop it renders as a column
// beside the main content; below the sidebar breakpoint the same markup
// becomes a slide-in drawer (see `open`/`onClose`, and section 34 of
// index.css). That's deliberate - a separate mobile menu would be a
// second navigation tree to keep in sync.

// Which category the current URL is "in", so it can be auto-expanded and
// marked active: /category/:id names one directly, /tool/:id resolves via
// the tool's own registry entry, and anywhere else has none.
//
// Read from the pathname rather than useParams() on purpose: this renders
// inside the pathless layout route, whose own route context carries none
// of the child route's params, so useParams() here would always be empty.
function activeCategoryIdFor(pathname) {
  const categoryMatch = pathname.match(/^\/category\/([^/]+)/);
  if (categoryMatch) return categoryMatch[1];

  const toolMatch = pathname.match(/^\/tool\/([^/]+)/);
  if (toolMatch) return getToolById(toolMatch[1])?.category ?? null;

  return null;
}

// How many tools a category shows before the "See more" toggle. Keeps all
// six categories open at once without the list running to 32 rows.
const VISIBLE_TOOLS = 5;

export default function Sidebar({ open, onClose }) {
  const location = useLocation();
  const categories = getToolsByCategory();
  const activeCategoryId = activeCategoryIdFor(location.pathname);
  const activeToolPath = location.pathname.startsWith('/tool/') ? location.pathname : null;

  // Every category starts open, so the whole tool structure is legible at a
  // glance rather than something you have to click six times to uncover.
  const [expandedIds, setExpandedIds] = useState(() => categories.map((category) => category.id));

  // Categories showing their full tool list rather than the first five.
  const [showAllIds, setShowAllIds] = useState([]);

  // Navigating into a category expands it, without collapsing anything the
  // user opened themselves - the sidebar should reveal where you now are,
  // not reset to some canonical state on every click.
  useEffect(() => {
    if (!activeCategoryId) return;
    setExpandedIds((prev) => (prev.includes(activeCategoryId) ? prev : [...prev, activeCategoryId]));
  }, [activeCategoryId]);

  // If the tool you're on sits past the truncation point, reveal the rest of
  // its category automatically - otherwise the sidebar would claim to show
  // where you are while hiding the one row that says so.
  useEffect(() => {
    if (!activeCategoryId || !activeToolPath) return;
    const category = categories.find((entry) => entry.id === activeCategoryId);
    const index = category?.tools.findIndex((tool) => `/tool/${tool.id}` === activeToolPath) ?? -1;
    if (index < VISIBLE_TOOLS) return;
    setShowAllIds((prev) => (prev.includes(activeCategoryId) ? prev : [...prev, activeCategoryId]));
    // `categories` is rebuilt from the registry on each render but is
    // structurally constant, so it is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryId, activeToolPath]);

  // Escape closes the mobile drawer, matching every other overlay on the
  // site (ConfirmDialog, CommandPalette).
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Stop the page behind the drawer from scrolling while it's open. Only
  // applies when the drawer is actually overlaying content - the desktop
  // sidebar is part of the normal page flow and locks nothing.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function toggleCategory(categoryId) {
    setExpandedIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    );
  }

  function toggleShowAll(categoryId) {
    setShowAllIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    );
  }

  return (
    <>
      {/* Only rendered while the drawer is open, so it can never intercept
          clicks on desktop where the sidebar is inline. */}
      {open && <div className="sidebar-scrim" onClick={onClose} role="presentation" />}

      <aside
        className={open ? 'sidebar open' : 'sidebar'}
        id="tool-sidebar"
        aria-label="Tool navigation"
      >
        <div className="sidebar-inner">
          <div className="sidebar-mobile-head">
            <span className="sidebar-heading">Browse tools</span>
            <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Tool categories">
            <ul className="sidebar-list">
              {categories.map((category) => {
                const CategoryIcon = category.icon;
                const isExpanded = expandedIds.includes(category.id);
                const isActiveCategory = category.id === activeCategoryId;
                const panelId = `sidebar-panel-${category.id}`;
                const showAll = showAllIds.includes(category.id);
                const hiddenCount = category.tools.length - VISIBLE_TOOLS;
                const visibleTools = showAll ? category.tools : category.tools.slice(0, VISIBLE_TOOLS);

                return (
                  <li key={category.id} className="sidebar-group">
                    {/* The category name is a real link to its page, and
                        expanding is a separate button - so the row is both
                        crawlable and keyboard-operable without one action
                        having to stand in for the other. */}
                    <div
                      className={
                        isActiveCategory ? 'sidebar-group-head active' : 'sidebar-group-head'
                      }
                    >
                      <Link to={`/category/${category.id}`} className="sidebar-category-link">
                        <span className="sidebar-category-icon" aria-hidden="true">
                          <CategoryIcon size={16} strokeWidth={1.75} />
                        </span>
                        <span className="sidebar-category-name">{category.name}</span>
                        <span className="sidebar-count">{category.tools.length}</span>
                      </Link>
                      <button
                        type="button"
                        className="sidebar-toggle"
                        onClick={() => toggleCategory(category.id)}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${category.name}`}
                      >
                        <ChevronRight
                          size={15}
                          aria-hidden="true"
                          className={isExpanded ? 'sidebar-chevron open' : 'sidebar-chevron'}
                        />
                      </button>
                    </div>

                    {/* Collapsed categories are unmounted rather than
                        visually hidden, so their links never become
                        invisible tab stops. Every tool is still reachable
                        for crawlers via the homepage directory and the
                        category pages, which list all of them as anchors. */}
                    {isExpanded && (
                      <ul className="sidebar-tools" id={panelId}>
                        {visibleTools.map((tool) => (
                          <li key={tool.id}>
                            <NavLink
                              to={`/tool/${tool.id}`}
                              className={({ isActive }) =>
                                isActive ? 'sidebar-tool active' : 'sidebar-tool'
                              }
                              aria-current={
                                location.pathname === `/tool/${tool.id}` ? 'page' : undefined
                              }
                            >
                              {tool.name}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Outside the <ul>: it is a control, not an entry, and
                        sitting among the links it read as one more tool. */}
                    {isExpanded && hiddenCount > 0 && (
                      <button
                        type="button"
                        className="sidebar-more"
                        onClick={() => toggleShowAll(category.id)}
                        aria-expanded={showAll}
                        aria-controls={panelId}
                      >
                        <ChevronDown
                          size={13}
                          aria-hidden="true"
                          className={showAll ? 'sidebar-more-chevron open' : 'sidebar-more-chevron'}
                        />
                        {showAll ? 'Show less' : `${hiddenCount} more`}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
          <Link to="/request-tool" className="sidebar-request" onClick={onClose}>
            <Lightbulb size={15} aria-hidden="true" />
            Missing a tool? Request it
          </Link>
        </div>
      </aside>
    </>
  );
}
