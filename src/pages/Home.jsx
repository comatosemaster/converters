import { Link } from 'react-router-dom';
import { getToolsByCategory } from '../tools/registry.js';
import ToolGrid from '../components/ToolGrid.jsx';

// The homepage: one section per category, each listing its tools as
// clickable cards. Everything here comes from the registry — this file
// never needs to change when a new tool is added.

export default function Home() {
  const categories = getToolsByCategory();

  return (
    <div className="home">
      <p className="home-intro">
        A collection of small, free utilities. Everything runs right here in your browser — no
        sign-up, no data leaves your device.
      </p>

      {categories.map((category) => (
        <section key={category.id} className="category-section">
          <h2>
            <Link to={`/category/${category.id}`}>{category.name}</Link>
          </h2>
          <ToolGrid tools={category.tools} />
        </section>
      ))}
    </div>
  );
}
