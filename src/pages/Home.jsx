import { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { getToolsByCategory } from '../tools/registry.js';

// The homepage: one section per category, each listing its tools as
// clickable cards. Everything here comes from the registry — this file
// never needs to change when a new tool is added.

export default function Home() {
  const location = useLocation();

  // When the header nav sends us to "/#some-category", scroll that
  // section into view. React Router doesn't do this automatically because
  // it never triggers a full page reload.
  useEffect(() => {
    if (location.hash) {
      const target = document.querySelector(location.hash);
      target?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash]);

  const categories = getToolsByCategory();

  return (
    <div className="home">
      <p className="home-intro">
        A collection of small, free utilities. Everything runs right here in your browser — no
        sign-up, no data leaves your device.
      </p>

      {categories.map((category) => (
        <section key={category.id} id={category.id} className="category-section">
          <h2>{category.name}</h2>

          {category.tools.length === 0 ? (
            <p className="category-empty">No tools here yet — check back soon.</p>
          ) : (
            <div className="tool-grid">
              {category.tools.map((tool) => (
                <Link key={tool.id} to={`/tool/${tool.id}`} className="tool-card">
                  <span className="tool-card-icon" aria-hidden="true">
                    {tool.icon}
                  </span>
                  <span className="tool-card-name">{tool.name}</span>
                  <span className="tool-card-description">{tool.description}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
