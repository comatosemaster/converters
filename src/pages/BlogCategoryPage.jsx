import { useParams } from 'react-router-dom';
import { getCategoryById } from '../tools/registry.js';
import { getArticlesByCategory } from '../blog/blogUtils.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { blogCategoryMeta } from '../seo/buildMeta.js';
import { breadcrumbSchema, collectionSchema } from '../seo/structuredData.js';
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

  const breadcrumbs = category
    ? [{ label: 'Home', to: '/' }, { label: 'Blog', to: '/blog' }, { label: category.name }]
    : [];

  // The description here is deliberately different from the tool category
  // page's. Both used to fall back to `category.tagline`, which meant
  // /category/developer and /blog/category/developer shipped identical
  // meta descriptions - a duplicate-content signal repeated across all six
  // categories.
  useDocumentMeta(
    category
      ? {
          ...blogCategoryMeta(category, categoryArticles.length),
          jsonLd: [
            collectionSchema({
              name: `${category.name} Articles`,
              description: `Guides and explainers on ${category.name.toLowerCase()} topics.`,
              path: `/blog/category/${category.id}`,
              items: categoryArticles.map((article) => ({
                name: article.title,
                path: `/blog/${article.slug}`,
              })),
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
