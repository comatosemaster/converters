import { Link } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import { getPopularTools } from '../tools/registry.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { NOT_FOUND_META } from '../seo/routes.js';
import ToolGrid from '../components/ToolGrid.jsx';

// Shown for unknown routes, and for /tool/:id where :id doesn't match
// anything in the registry (e.g. a typo or an old bookmarked link).
// Rather than dead-ending, it offers the popular tools as a way forward.
//
// This view owns its own metadata, including `noindex` and no canonical.
// The build also prerenders it as dist/404.html, which Cloudflare serves
// with a real 404 status for any URL that isn't a prerendered page (see
// wrangler.jsonc) - so unknown URLs are never soft 404s.

export default function NotFound() {
  useDocumentMeta(NOT_FOUND_META);

  return (
    <div className="not-found">
      <div className="not-found-panel">
        <span className="not-found-icon" aria-hidden="true">
          <Compass size={26} strokeWidth={1.75} />
        </span>
        <h1>Page not found</h1>
        <p>
          That link doesn&apos;t point to a tool we have - it may have been renamed or mistyped.
        </p>
        <Link to="/" className="btn btn-primary">
          Back to all tools <ArrowRight size={16} />
        </Link>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Popular tools</h2>
            <p>Maybe one of these is what you were after.</p>
          </div>
        </div>
        <ToolGrid tools={getPopularTools()} />
      </section>
    </div>
  );
}
