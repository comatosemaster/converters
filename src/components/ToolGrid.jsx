import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Highlight from './Highlight.jsx';

// A grid of tool cards. Shared by the homepage, each category page, and
// the homepage search results, so the card markup only lives in one place.
//
// `query` is optional - when present, matching text inside the card is
// highlighted so search results show why they matched.

export default function ToolGrid({ tools, query = '', emptyMessage = 'No tools here yet - check back soon.' }) {
  if (tools.length === 0) {
    return <p className="category-empty">{emptyMessage}</p>;
  }

  return (
    <div className="tool-grid">
      {tools.map((tool) => {
        const ToolIcon = tool.icon;
        return (
          <Link key={tool.id} to={`/tool/${tool.id}`} className="tool-card">
            <span className="tool-card-icon" aria-hidden="true">
              <ToolIcon size={22} strokeWidth={1.75} />
            </span>
            <span className="tool-card-name">
              <Highlight text={tool.name} query={query} />
            </span>
            <span className="tool-card-description">
              <Highlight text={tool.description} query={query} />
            </span>
            <span className="tool-card-arrow" aria-hidden="true">
              Open <ArrowRight size={14} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
