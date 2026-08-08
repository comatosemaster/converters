import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { BookOpen, Search, Menu, X, Layers, Sun, Moon } from 'lucide-react';
import { CATEGORIES } from '../tools/registry.js';
import { useTheme } from '../hooks/useTheme.js';
import CommandPalette from './CommandPalette.jsx';

// The shared frame around every page: a sticky header (brand + category
// nav + search), the page content itself (<Outlet /> is where React Router
// inserts whichever page is currently active), and a footer.
//
// Because the nav and footer are built by mapping over CATEGORIES, adding
// a 6th category later is a one-line change in the registry - not a
// rewrite here.

export default function Layout() {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // ⌘K / Ctrl+K opens search from anywhere on the site.
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close the mobile menu whenever the route changes, so tapping a link
  // doesn't leave the menu hanging open over the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-name">
            <span className="site-logo" aria-hidden="true">
              <Layers size={17} strokeWidth={2.25} />
            </span>
            Rootconverter
          </Link>

          <nav className="category-nav" aria-label="Tool categories">
            {CATEGORIES.map((category) => (
              <NavLink
                key={category.id}
                to={`/category/${category.id}`}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {category.name}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            {/* Deliberately outside .category-nav: the categories filter
                TOOLS, while this is a separate destination. Grouping it
                with them made it read as a seventh tool category. */}
            <NavLink
              to="/blog"
              className={({ isActive }) => (isActive ? 'nav-blog-link active' : 'nav-blog-link')}
              // The visible label is hidden on narrow screens, leaving only
              // a decorative icon - so the accessible name has to come from
              // here or the link becomes unnamed for screen readers.
              aria-label="Blog"
            >
              <BookOpen size={15} aria-hidden="true" />
              <span className="nav-blog-label">Blog</span>
            </NavLink>

            <button
              type="button"
              className="header-search-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search tools"
            >
              <Search size={16} aria-hidden="true" />
              <span className="label">Search tools</span>
              <span className="kbd-hint">
                <kbd className="kbd">Ctrl K</kbd>
              </span>
            </button>

            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>

            <button
              type="button"
              className="nav-toggle"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* No Blog entry here: the accent pill in the header stays visible
            at every width, so repeating it in the menu would be a second
            link to the same place. */}
        <nav
          className={mobileNavOpen ? 'mobile-nav open' : 'mobile-nav'}
          aria-label="Tool categories (mobile)"
        >
          {CATEGORIES.map((category) => {
            const CategoryIcon = category.icon;
            return (
              <NavLink
                key={category.id}
                to={`/category/${category.id}`}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                <CategoryIcon size={16} aria-hidden="true" />
                {category.name}
              </NavLink>
            );
          })}
        </nav>
      </header>

      <main className="site-main" id="main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-brand">
            <Link to="/" className="site-name">
              <span className="site-logo" aria-hidden="true">
                <Layers size={17} strokeWidth={2.25} />
              </span>
              Rootconverter
            </Link>
            <p>
              Free, fast, browser-based tools. Every conversion runs on your own device - nothing
              you open, type, or upload is ever sent to a server.
            </p>
          </div>

          <div className="footer-col">
            <h3>Categories</h3>
            <ul>
              {CATEGORIES.map((category) => (
                <li key={category.id}>
                  <Link to={`/category/${category.id}`}>{category.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-col">
            <h3>Site</h3>
            <ul>
              <li>
                <Link to="/">All tools</Link>
              </li>
              <li>
                <Link to="/blog">Blog</Link>
              </li>
              <li>
                <button type="button" className="link-button" onClick={() => setPaletteOpen(true)}>
                  Search tools
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="site-footer-bottom">
          <span>&copy; {new Date().getFullYear()} Rootconverter</span>
          <span>100% client-side · No tracking · No sign-up</span>
        </div>
      </footer>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Scrolls to the top on a normal navigation (clicking a link to
          another page), while still correctly restoring the previous
          scroll position on browser back/forward - without this, React
          Router leaves the scroll position exactly where it was on the
          old page, so a new page could load already scrolled halfway
          down. */}
      <ScrollRestoration />
    </div>
  );
}
