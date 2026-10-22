import { useParams } from 'react-router-dom';
import { getCategoryById, getToolsByCategory } from '../tools/registry.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { useCurrentRoute } from '../hooks/useCurrentRoute.js';
import ToolGrid from '../components/ToolGrid.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import NotFound from './NotFound.jsx';

// The dedicated page for one category, e.g. /category/text-data. Lists just
// that category's tools. Like Home.jsx, this never needs to change when a
// new tool (or even a new category) is added - it reads from the registry.

export default function CategoryPage() {
  const { categoryId } = useParams();
  const category = getCategoryById(categoryId);

  // getToolsByCategory() groups every category's tools; pick out this one.
  const group = category ? getToolsByCategory().find((entry) => entry.id === categoryId) : null;
  const tools = group?.tools ?? [];

  // Metadata, breadcrumbs and structured data (a CollectionPage listing
  // these same tools, in this order) come from the route registry. An
  // unknown id - or a category with no tools yet, which has no page - gets
  // no entry and renders NotFound, which owns its own metadata (noindex).
  const route = useCurrentRoute();
  useDocumentMeta(route);

  if (!category || !route) {
    return <NotFound />;
  }

  const CategoryIcon = category.icon;

  return (
    <div className="category-page">
      <Breadcrumbs items={route.breadcrumbs} />

      <header className="page-header">
        <div className="page-header-row">
          <span className="tool-header-icon" aria-hidden="true">
            <CategoryIcon size={24} strokeWidth={1.75} />
          </span>
          <h1>{category.name}</h1>
          <span className="count-badge">
            {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
          </span>
        </div>
        <p>{category.tagline}</p>
        {category.intro && <p className="category-intro">{category.intro}</p>}
      </header>

      <ToolGrid
        tools={tools}
        emptyMessage="No tools in this category yet - more are on the way."
        requestCard
      />
    </div>
  );
}
