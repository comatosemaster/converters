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
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import ToolGrid from '../components/ToolGrid.jsx';
import ArticleGrid from '../components/blog/ArticleGrid.jsx';
import TableOfContents from '../components/blog/TableOfContents.jsx';
import ArticleContent from '../components/blog/ArticleContent.jsx';
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

  const canonicalPath = article ? `/blog/${article.slug}` : undefined;
  const absoluteUrl =
    article && typeof window !== 'undefined' ? new URL(canonicalPath, window.location.origin).href : undefined;

  // Hooks must run on every render, so this (and the metadata above) is
  // computed before the early "not found" return below.
  useDocumentMeta({
    title: article ? `${article.seoTitle} | Rootconverter Blog` : 'Not found | Rootconverter',
    description: article?.metaDescription,
    canonical: canonicalPath,
    image: article?.coverImage ?? undefined,
    type: 'article',
    jsonLd: article
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.seoTitle,
            description: article.metaDescription,
            datePublished: article.publishDate.toISOString(),
            dateModified: (article.updatedDate ?? article.publishDate).toISOString(),
            author: { '@type': 'Organization', name: article.author },
            ...(article.coverImage ? { image: article.coverImage } : {}),
            mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: new URL('/', window.location.origin).href },
              { '@type': 'ListItem', position: 2, name: 'Blog', item: new URL('/blog', window.location.origin).href },
              { '@type': 'ListItem', position: 3, name: article.title, item: absoluteUrl },
            ],
          },
        ]
      : undefined,
  });

  if (!article) {
    return <NotFound />;
  }

  const relatedTools = getRelatedToolsForArticle(article);
  const relatedArticles = getRelatedArticles(article.slug);
  const { previous, next } = getAdjacentArticles(article.slug);

  return (
    <article className="article-page">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Blog', to: '/blog' },
          ...(category ? [{ label: category.name, to: `/blog/category/${category.id}` }] : []),
          { label: article.title },
        ]}
      />

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
