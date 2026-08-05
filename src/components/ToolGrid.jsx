import { Link } from 'react-router-dom';

// A grid of tool cards. Shared by the homepage (one grid per category) and
// each category's dedicated page (one grid for just that category), so the
// card markup only lives in one place.

export default function ToolGrid({ tools }) {
  if (tools.length === 0) {
    return <p className="category-empty">No tools here yet — check back soon.</p>;
  }

  return (
    <div className="tool-grid">
      {tools.map((tool) => (
        <Link key={tool.id} to={`/tool/${tool.id}`} className="tool-card">
          <span className="tool-card-icon" aria-hidden="true">
            {tool.icon}
          </span>
          <span className="tool-card-name">{tool.name}</span>
          <span className="tool-card-description">{tool.description}</span>
        </Link>
      ))}
    </div>
  );
}
