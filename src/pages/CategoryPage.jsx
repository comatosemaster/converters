import { useParams } from 'react-router-dom';
import { getCategoryById, getToolsByCategory } from '../tools/registry.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import ToolGrid from '../components/ToolGrid.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import NotFound from './NotFound.jsx';

// The dedicated page for one category, e.g. /category/text-data. Lists just
// that category's tools. Like Home.jsx, this never needs to change when a
// new tool (or even a new category) is added - it reads from the registry.

export default function CategoryPage() {
  const { categoryId } = useParams();
  const category = getCategoryById(categoryId);

  // Hooks must run on every render, so this is computed before the early
  // return below - with safe fallbacks for an unknown category id.
  useDocumentMeta({
    title: category ? `${category.name} Tools | Rootconverter` : 'Not found | Rootconverter',
    description: category?.tagline,
  });

  if (!category) {
    return <NotFound />;
  }

  // getToolsByCategory() groups every category's tools; pick out this one.
  const { tools } = getToolsByCategory().find((entry) => entry.id === categoryId);
  const CategoryIcon = category.icon;

  return (
    <div className="category-page">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: category.name }]} />

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
      </header>

      <ToolGrid
        tools={tools}
        emptyMessage="No tools in this category yet - more are on the way."
      />
    </div>
  );
}
