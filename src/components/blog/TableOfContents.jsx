import { useMemo, useState } from 'react';
import { ChevronDown, List } from 'lucide-react';
import { useActiveHeading } from '../../hooks/useActiveHeading.js';

// Auto-generated from the article's own h2/h3 headings (see
// renderMarkdown() in blogUtils.js, which assigns each heading an id this
// links to). Sticky in the sidebar on desktop (see .toc in index.css);
// collapsed behind a toggle button on mobile, where there's no sidebar to
// be sticky in.

export default function TableOfContents({ headings }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const headingIds = useMemo(() => headings.map((heading) => heading.id), [headings]);
  const activeId = useActiveHeading(headingIds);

  if (headings.length === 0) return null;

  return (
    <nav className="toc" aria-label="Table of contents">
      <button
        type="button"
        className="toc-mobile-toggle"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
      >
        <List size={16} aria-hidden="true" />
        On this page
        <ChevronDown size={16} aria-hidden="true" className={mobileOpen ? 'toc-chevron open' : 'toc-chevron'} />
      </button>

      <ul className={mobileOpen ? 'toc-list open' : 'toc-list'}>
        {headings.map((heading) => (
          <li key={heading.id} className={`toc-item toc-depth-${heading.depth}`}>
            <a
              href={`#${heading.id}`}
              className={activeId === heading.id ? 'active' : undefined}
              onClick={() => setMobileOpen(false)}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
