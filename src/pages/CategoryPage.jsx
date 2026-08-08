import { useParams } from 'react-router-dom';
import { getCategoryById, getToolsByCategory } from '../tools/registry.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { categoryMeta } from '../seo/buildMeta.js';
import { breadcrumbSchema, collectionSchema } from '../seo/structuredData.js';
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
  // Resolved before the early return because the metadata below needs the
  // count, and hooks must run unconditionally.
  const group = category ? getToolsByCategory().find((entry) => entry.id === categoryId) : null;
  const tools = group?.tools ?? [];

  const breadcrumbs = category ? [{ label: 'Home', to: '/' }, { label: category.name }] : [];

  // An unknown id renders NotFound, which owns its own metadata (including
  // noindex) - so this passes nothing rather than describing a page that
  // doesn't exist.
  useDocumentMeta(
    category
      ? {
          ...categoryMeta(category, tools.length),
          jsonLd: [
            collectionSchema({
              name: `${category.name} Tools`,
              description: category.tagline,
              path: `/category/${category.id}`,
              // Mirrors the tool cards actually rendered below, in order.
              items: tools.map((tool) => ({ name: tool.name, path: `/tool/${tool.id}` })),
            }),
            breadcrumbSchema(breadcrumbs),
          ],
        }
      : {},
  );

  if (!category) {
    return <NotFound />;
  }

  const CategoryIcon = category.icon;

  return (
    <div className="category-page">
      <Breadcrumbs items={breadcrumbs} />

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
