import { Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Breadcrumbs from './Breadcrumbs.jsx';
import ToolGrid from './ToolGrid.jsx';
import ArticleGrid from './blog/ArticleGrid.jsx';
import { getArticlesForTool } from '../blog/blogUtils.js';

// The standard frame every tool page shares: breadcrumbs, an icon + title
// + description header, the tool's own UI in a card, a privacy note, and
// related tools at the bottom.
//
// ToolPage.jsx applies this automatically around whichever tool component
// is being shown, so individual tool files (like Base64Tool.jsx) never
// need to import or think about this - they just focus on their own
// inputs/outputs/logic.

// Shown while a tool's chunk downloads. Deliberately a fixed-height block
// rather than a spinner: it reserves roughly the space the tool will
// occupy, so the page doesn't jump when the real UI arrives. Layout shift
// is a Core Web Vitals input, and a jumping page is worse than a still one.
function ToolLoading() {
  return (
    <div className="tool-loading" role="status" aria-live="polite">
      <span className="visually-hidden">Loading tool…</span>
      <span className="tool-loading-bar" aria-hidden="true" />
      <span className="tool-loading-bar" aria-hidden="true" />
      <span className="tool-loading-bar short" aria-hidden="true" />
    </div>
  );
}

export default function ToolLayout({ tool, category, relatedTools = [], breadcrumbs, children }) {
  const ToolIcon = tool.icon;
  // Reverse lookup: finds every article whose OWN `relatedTools`
  // frontmatter lists this tool - the relationship lives entirely in the
  // article's metadata (see blogUtils.js), so this tool page never needs
  // to know which articles exist, let alone list them itself.
  const relatedArticles = getArticlesForTool(tool.id);

  return (
    <article className="tool">
      {/* ToolPage passes the same array it marks up as BreadcrumbList, so
          the visible trail and the structured data can never disagree.
          The fallback keeps this component usable on its own. */}
      <Breadcrumbs
        items={
          breadcrumbs ?? [
            { label: 'Home', to: '/' },
            ...(category ? [{ label: category.name, to: `/category/${category.id}` }] : []),
            { label: tool.name },
          ]
        }
      />

      <header className="tool-header">
        <div className="tool-header-row">
          <span className="tool-header-icon" aria-hidden="true">
            <ToolIcon size={24} strokeWidth={1.75} />
          </span>
          <h1>{tool.name}</h1>
        </div>
        {tool.description && <p className="tool-description">{tool.description}</p>}
      </header>

      {/* The Suspense boundary wraps ONLY the tool itself, not the page.
          Every tool is a lazily-loaded chunk now, and putting the boundary
          here means the breadcrumbs, h1, description and related tools all
          render on the first paint - so a crawler (and a reader) gets the
          page's text and links immediately, and only the interactive part
          arrives a moment later. A boundary further up would blank the
          whole page while a chunk downloads. */}
      <div className="tool-content">
        <Suspense fallback={<ToolLoading />}>{children}</Suspense>
      </div>

      <p className="tool-privacy-note">
        <ShieldCheck size={15} aria-hidden="true" />
        Runs entirely in your browser - nothing you enter or upload is sent to a server.
      </p>

      {relatedTools.length > 0 && (
        <section className="related-tools">
          <h2>Related tools</h2>
          <ToolGrid tools={relatedTools} />
          {category && (
            <p className="field-hint" style={{ marginTop: 'var(--sp-5)' }}>
              Or browse all <Link to={`/category/${category.id}`}>{category.name}</Link> tools.
            </p>
          )}
        </section>
      )}

      {relatedArticles.length > 0 && (
        <section className="related-tools">
          <h2>Related articles</h2>
          <ArticleGrid articles={relatedArticles} />
        </section>
      )}
    </article>
  );
}
