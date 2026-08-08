import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Highlight from './Highlight.jsx';

// A grid of tool cards. Shared by the homepage, each category page, and
// the homepage search results, so the card markup only lives in one place.
//
// `query` is optional - when present, matching text inside the card is
// highlighted so search results show why they matched.
//
// `featured` is optional - it gives the cards a slightly stronger border
// and a small "Popular" badge. It's a presentation flag passed in by
// whoever is rendering the row, NOT something read off the tool itself:
// the same tool renders as an ordinary card further down the homepage in
// its category section, and should not be badged twice on one page.

export default function ToolGrid({
  tools,
  query = '',
  featured = false,
  emptyMessage = 'No tools here yet - check back soon.',
}) {
  if (tools.length === 0) {
    return <p className="category-empty">{emptyMessage}</p>;
  }

  return (
    <div className={featured ? 'tool-grid tool-grid-featured' : 'tool-grid'}>
      {tools.map((tool) => {
        const ToolIcon = tool.icon;
        return (
          <Link
            key={tool.id}
            to={`/tool/${tool.id}`}
            className={featured ? 'tool-card featured' : 'tool-card'}
          >
            <span className="tool-card-top">
              <span className="tool-card-icon" aria-hidden="true">
                <ToolIcon size={21} strokeWidth={1.75} />
              </span>
              {featured && <span className="tool-card-badge">Popular</span>}
            </span>
            <span className="tool-card-name">
              <Highlight text={tool.name} query={query} />
            </span>
            <span className="tool-card-description">
              <Highlight text={tool.description} query={query} />
            </span>
            <span className="tool-card-arrow" aria-hidden="true">
              <ArrowRight size={15} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
