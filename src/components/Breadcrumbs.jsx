import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// A standard breadcrumb trail, rendered as a real <nav> + ordered list so
// screen readers announce it as navigation and search engines can read the
// site hierarchy.
//
// Usage: <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Tool' }]} />
// The last item is treated as the current page (no link).

export default function Breadcrumbs({ items }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.to ?? item.label} className="breadcrumb-item">
            {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
            {isLast || !item.to ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <Link to={item.to}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
