import { Link, Outlet } from 'react-router-dom';
import { CATEGORIES } from '../tools/registry.js';

// The shared frame around every page: a header (site name + category nav),
// the page content itself (<Outlet /> is where React Router inserts
// whichever page is currently active), and a footer.
//
// Because the nav is built by mapping over CATEGORIES, adding a 6th
// category later is a one-line change here — not a rewrite.

export default function Layout() {
  return (
    <div className="site">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-name">
            Toolbox
          </Link>
          <nav className="category-nav" aria-label="Tool categories">
            {CATEGORIES.map((category) => (
              <Link key={category.id} to={`/category/${category.id}`}>
                {category.name}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <p>
          Toolbox — every tool runs entirely in your browser. Nothing you type or upload is ever
          sent anywhere.
        </p>
      </footer>
    </div>
  );
}
