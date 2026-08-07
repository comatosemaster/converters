import { useParams } from 'react-router-dom';
import { getCategoryById } from '../tools/registry.js';
import { getArticlesByCategory } from '../blog/blogUtils.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import ArticleGrid from '../components/blog/ArticleGrid.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import NotFound from './NotFound.jsx';

// The dedicated page for one blog category, e.g. /blog/category/developer -
// reuses the exact same CATEGORIES the tools use (per the "reuse tool
// categories" requirement), so a category only ever needs to be defined
// once, in src/tools/registry.js.

export default function BlogCategoryPage() {
  const { categoryId } = useParams();
  const category = getCategoryById(categoryId);

  // Hooks must run on every render, so this is computed before the early
  // return below - with safe fallbacks for an unknown category id.
  useDocumentMeta({
    title: category ? `${category.name} Articles | Rootconverter Blog` : 'Not found | Rootconverter',
    description: category?.tagline,
    canonical: category ? `/blog/category/${category.id}` : undefined,
  });

  if (!category) {
    return <NotFound />;
  }

  const categoryArticles = getArticlesByCategory(categoryId);
  const CategoryIcon = category.icon;

  return (
    <div className="category-page">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Blog', to: '/blog' }, { label: category.name }]} />

      <header className="page-header">
        <div className="page-header-row">
          <span className="tool-header-icon" aria-hidden="true">
            <CategoryIcon size={24} strokeWidth={1.75} />
          </span>
          <h1>{category.name} articles</h1>
          <span className="count-badge">
            {categoryArticles.length} {categoryArticles.length === 1 ? 'article' : 'articles'}
          </span>
        </div>
        <p>{category.tagline}</p>
      </header>

      <ArticleGrid
        articles={categoryArticles}
        emptyMessage="No articles in this category yet - more are on the way."
      />
    </div>
  );
}
