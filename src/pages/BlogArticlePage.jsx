import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calendar, Clock, User } from 'lucide-react';
import { getCategoryById } from '../tools/registry.js';
import {
  formatArticleDate,
  getAdjacentArticles,
  getArticleBySlug,
  getRelatedArticles,
  getRelatedToolsForArticle,
} from '../blog/blogUtils.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { useCurrentRoute } from '../hooks/useCurrentRoute.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import ToolGrid from '../components/ToolGrid.jsx';
import ArticleGrid from '../components/blog/ArticleGrid.jsx';
import TableOfContents from '../components/blog/TableOfContents.jsx';
import ArticleContent from '../components/blog/ArticleContent.jsx';
import SubscribeForm from '../components/SubscribeForm.jsx';
import ShareButtons from '../components/blog/ShareButtons.jsx';
import NotFound from './NotFound.jsx';

const DIFFICULTY_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

// The one reusable template every article renders through - this file
// never changes when a new article is added. The router (see App.jsx)
// passes whichever :slug is in the URL; everything else (metadata,
// rendered HTML, related tools/articles) comes from blogUtils.js reading
// the matching .md file in src/content/blog/.

export default function BlogArticlePage() {
  const { slug } = useParams();
  const article = getArticleBySlug(slug);
  const category = article ? getCategoryById(article.category) : null;

  // Metadata, structured data (BlogPosting + BreadcrumbList) and the
  // breadcrumb trail all come from the route registry, so the visible trail
  // and its markup can't disagree. Hooks must run on every render, so this
  // comes before the early "not found" return.
  const route = useCurrentRoute();
  useDocumentMeta(route);

  if (!article || !route) {
    return <NotFound />;
  }

  const canonicalPath = `/blog/${article.slug}`;

  const relatedTools = getRelatedToolsForArticle(article);
  const relatedArticles = getRelatedArticles(article.slug);
  const { previous, next } = getAdjacentArticles(article.slug);

  return (
    <article className="article-page">
      <Breadcrumbs items={route.breadcrumbs} />

      <header className="article-header">
        {category && (
          <Link to={`/blog/category/${category.id}`} className="article-category-badge">
            {category.name}
          </Link>
        )}

        <h1>{article.title}</h1>
        {article.description && <p className="article-description">{article.description}</p>}

        <div className="article-meta-row">
          <span className="article-meta-item">
            <User size={14} aria-hidden="true" /> {article.author}
          </span>
          <span className="article-meta-item">
            <Calendar size={14} aria-hidden="true" /> {formatArticleDate(article.publishDate)}
          </span>
          <span className="article-meta-item">
            <Clock size={14} aria-hidden="true" /> {article.readingTime} min read
          </span>
          {article.difficulty && (
            <span className="article-meta-item">{DIFFICULTY_LABELS[article.difficulty] ?? article.difficulty}</span>
          )}
        </div>

        {article.updatedDate && (
          <p className="article-updated-note">Last updated {formatArticleDate(article.updatedDate)}</p>
        )}

        {article.tags.length > 0 && (
          <div className="tag-chip-row">
            {article.tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="article-page-grid">
        <div className="article-page-main">
          <ArticleContent html={article.html} />

          <SubscribeForm
            source="blog"
            title="Get new guides by email"
            description="One short email when new tools or guides are published - at most once a week."
          />

          <ShareButtons url={canonicalPath} title={article.title} />

          {relatedTools.length > 0 && (
            <section className="related-tools">
              <h2>Related tools</h2>
              <ToolGrid tools={relatedTools} />
            </section>
          )}

          {relatedArticles.length > 0 && (
            <section className="related-tools">
              <h2>Related articles</h2>
              <ArticleGrid articles={relatedArticles} />
            </section>
          )}

          {(previous || next) && (
            <nav className="article-prev-next" aria-label="More articles">
              {previous ? (
                <Link to={`/blog/${previous.slug}`} className="article-prev-next-link prev">
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>
                    <span className="article-prev-next-label">Previous</span>
                    {previous.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link to={`/blog/${next.slug}`} className="article-prev-next-link next">
                  <span>
                    <span className="article-prev-next-label">Next</span>
                    {next.title}
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </nav>
          )}
        </div>

        <aside className="article-page-aside">
          <TableOfContents headings={article.headings} />
        </aside>
      </div>
    </article>
  );
}
