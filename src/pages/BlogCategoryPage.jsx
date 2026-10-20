import { useParams } from 'react-router-dom';
import { getCategoryById } from '../tools/registry.js';
import { getArticlesByCategory } from '../blog/blogUtils.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { useCurrentRoute } from '../hooks/useCurrentRoute.js';
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

  const categoryArticles = category ? getArticlesByCategory(categoryId) : [];

  // Metadata, breadcrumbs and structured data come from the route
  // registry. Its description is deliberately different from the tool
  // category page's (see blogCategoryMeta) - two indexable URLs sharing one
  // is a duplicate-content signal.
  //
  // A category with no articles has no entry: it would be a page with
  // nothing on it, so it's a 404 instead (and isn't linked from /blog).
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
          <h1>{category.name} articles</h1>
          <span className="count-badge">
            {categoryArticles.length} {categoryArticles.length === 1 ? 'article' : 'articles'}
          </span>
        </div>
        <p>{category.tagline}</p>
        {category.blogIntro && <p className="category-intro">{category.blogIntro}</p>}
      </header>

      <ArticleGrid
        articles={categoryArticles}
        emptyMessage="No articles in this category yet - more are on the way."
      />
    </div>
  );
}
