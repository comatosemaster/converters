import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Breadcrumbs from './Breadcrumbs.jsx';
import ToolGrid from './ToolGrid.jsx';

// The standard frame every tool page shares: breadcrumbs, an icon + title
// + description header, the tool's own UI in a card, a privacy note, and
// related tools at the bottom.
//
// ToolPage.jsx applies this automatically around whichever tool component
// is being shown, so individual tool files (like Base64Tool.jsx) never
// need to import or think about this - they just focus on their own
// inputs/outputs/logic.

export default function ToolLayout({ tool, category, relatedTools = [], children }) {
  const ToolIcon = tool.icon;

  return (
    <article className="tool">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          ...(category ? [{ label: category.name, to: `/category/${category.id}` }] : []),
          { label: tool.name },
        ]}
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

      <div className="tool-content">{children}</div>

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
    </article>
  );
}
