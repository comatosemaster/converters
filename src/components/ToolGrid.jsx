import { Link } from 'react-router-dom';
import { ArrowRight, Lightbulb } from 'lucide-react';
import Highlight from './Highlight.jsx';

// A grid of tool cards. Shared by the homepage, each category page, and
// the homepage search results, so the card markup only lives in one place.
//
// `query` is optional - when present, matching text inside the card is
// highlighted so search results show why they matched.
//
// `requestCard` adds a final "Missing a tool? Request it" card, linking to
// /request-tool - shown at the end of tool listings.
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
  requestCard = false,
}) {
  if (tools.length === 0 && !requestCard) {
    return <p className="category-empty">{emptyMessage}</p>;
  }

  return (
    <>
    {tools.length === 0 && <p className="category-empty">{emptyMessage}</p>}
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
      {requestCard && (
        <Link to="/request-tool" className="tool-card tool-card-request">
          <span className="tool-card-top">
            <span className="tool-card-icon" aria-hidden="true">
              <Lightbulb size={21} strokeWidth={1.75} />
            </span>
          </span>
          <span className="tool-card-name">Missing a tool? Request it</span>
          <span className="tool-card-description">Tell us what you need - free, private tools get added regularly.</span>
          <span className="tool-card-arrow" aria-hidden="true">
            <ArrowRight size={15} />
          </span>
        </Link>
      )}
    </div>
    </>
  );
}
