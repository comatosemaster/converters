import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Mail, Search } from 'lucide-react';
import {
  getArticlesGroupedByCategory,
  getFeaturedArticles,
  getLatestArticles,
  searchArticles,
} from '../blog/blogUtils.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import ArticleGrid from '../components/blog/ArticleGrid.jsx';

// The blog homepage: hero + search, featured articles, categories (reusing
// the same CATEGORIES the tools use), latest articles, and a newsletter
// placeholder. Like Home.jsx, this never needs to change when a new
// article is added - everything comes from blogUtils.js reading whatever
// is in src/content/blog/.

export default function BlogHome() {
  const [query, setQuery] = useState('');

  useDocumentMeta({
    title: 'Blog - Guides & Explainers | Rootconverter',
    description:
      "Plain-English guides on file formats, encoding, and the tools that work with them - written to help you understand what you're converting, not just do it.",
    canonical: '/blog',
  });

  const featured = useMemo(() => getFeaturedArticles(), []);
  const latest = useMemo(() => getLatestArticles(9), []);
  const categories = useMemo(() => getArticlesGroupedByCategory(), []);
  const results = useMemo(() => searchArticles(query), [query]);
  const isSearching = query.trim().length > 0;

  return (
    <div className="home blog-home">
      <section className="hero animate-in">
        <p className="hero-eyebrow">
          <strong>
            <BookOpen size={12} aria-hidden="true" /> Blog
          </strong>
          Guides and explainers, not just tools
        </p>

        <h1>
          Understand the <span className="accent-text">formats and tools</span> you use every day
        </h1>

        <p className="hero-sub">
          Practical, plain-English articles on encoding, file formats, and the tools that work
          with them - with links to the right Rootconverter tool whenever you're ready to actually
          do the thing.
        </p>

        <div className="hero-search">
          <Search className="hero-search-icon" size={20} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search articles - try “base64”, “json”, or “css”…"
            aria-label="Search articles"
            autoComplete="off"
          />
        </div>
      </section>

      {isSearching ? (
        <section className="section" aria-live="polite">
          <div className="section-head">
            <div>
              <h2>
                {results.length} result{results.length === 1 ? '' : 's'} for “{query}”
              </h2>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
              Clear search
            </button>
          </div>
          <ArticleGrid
            articles={results}
            query={query}
            emptyMessage="No articles match that search yet. Try a broader term or browse by category below."
          />
        </section>
      ) : (
        <>
          {featured.length > 0 && (
            <section className="section">
              <div className="section-head">
                <div>
                  <h2>Featured articles</h2>
                  <p>Start here.</p>
                </div>
              </div>
              <ArticleGrid articles={featured} />
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <div>
                <h2>Browse by category</h2>
                <p>Find articles about the format or tool you're working with.</p>
              </div>
            </div>
            <div className="blog-category-grid">
              {categories.map((category) => {
                const CategoryIcon = category.icon;
                return (
                  <Link key={category.id} to={`/blog/category/${category.id}`} className="blog-category-card">
                    <span className="category-icon" aria-hidden="true">
                      <CategoryIcon size={19} strokeWidth={1.75} />
                    </span>
                    <span className="blog-category-card-name">{category.name}</span>
                    <span className="count-badge">
                      {category.articles.length} {category.articles.length === 1 ? 'article' : 'articles'}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <h2>Latest articles</h2>
                <p>Everything, newest first.</p>
              </div>
            </div>
            <ArticleGrid articles={latest} emptyMessage="No articles published yet - check back soon." />
          </section>

          <section className="section">
            <div className="cta-panel newsletter-panel">
              <span className="newsletter-icon" aria-hidden="true">
                <Mail size={22} strokeWidth={1.75} />
              </span>
              <h2>Get new articles by email</h2>
              <p>A newsletter is coming soon - for now, check back here or follow along via the blog itself.</p>
              <span className="count-badge">Coming soon</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
