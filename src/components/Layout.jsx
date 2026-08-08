import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { BookOpen, Search, Menu, X, Sun, Moon } from 'lucide-react';
import { CATEGORIES } from '../tools/registry.js';
import { useTheme } from '../hooks/useTheme.js';
import CommandPalette from './CommandPalette.jsx';
import Sidebar from './Sidebar.jsx';

// The shared frame around every page: a sticky header (brand + category
// nav + search), the tool sidebar, the page content itself (<Outlet /> is
// where React Router inserts whichever page is currently active), and a
// footer.
//
// Because the nav and footer are built by mapping over CATEGORIES, adding
// a 6th category later is a one-line change in the registry - not a
// rewrite here.

// The sidebar navigates tools, so it accompanies the tool side of the site
// (homepage, category pages, tool pages) and stays out of the blog, whose
// pages are narrow reading columns with their own article navigation.
function usesToolSidebar(pathname) {
  return !pathname.startsWith('/blog');
}

export default function Layout() {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const showSidebar = usesToolSidebar(location.pathname);

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
            {/* Decorative: the wordmark beside it already names the site,
                so alt="" keeps screen readers from announcing it twice. */}
            <img src="/logo.png" alt="" className="site-logo" width="34" height="34" />
            {/* Two-tone wordmark. No whitespace between the spans - JSX
                would render it as a visible space inside the word. */}
            <span>
              Root<span className="site-name-accent">converter</span>
            </span>
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

            {/* Opens the sidebar as a drawer at narrow widths. The drawer
                lists categories AND the tools inside them, so it replaces
                the old category-only dropdown outright rather than sitting
                alongside it as a second mobile menu. */}
            <button
              type="button"
              className="nav-toggle"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileNavOpen}
              aria-controls="tool-sidebar"
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* The sidebar is always mounted, but only claims a desktop column on
          the tool side of the site (.has-sidebar). On the blog it collapses
          away on desktop while still being reachable as the mobile drawer -
          otherwise the hamburger would open nothing there, and narrow
          screens would lose category navigation entirely, since the header's
          category nav is hidden at that width. */}
      <div className={showSidebar ? 'site-body has-sidebar' : 'site-body'}>
        <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        <main className="site-main" id="main">
          <Outlet />
        </main>
      </div>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-brand">
            <Link to="/" className="site-name">
              <img src="/logo.png" alt="" className="site-logo" width="34" height="34" />
              <span>
                Root<span className="site-name-accent">converter</span>
              </span>
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
