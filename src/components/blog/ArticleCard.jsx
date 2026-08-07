import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { getCategoryById } from '../../tools/registry.js';
import { formatArticleDate } from '../../blog/blogUtils.js';
import Highlight from '../Highlight.jsx';

const DIFFICULTY_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

// One article preview card - shared by the blog homepage (featured +
// latest sections), category pages, and search results, the same way
// ToolGrid/tool-card is the one place every tool card's markup lives.
//
// `query` is optional - when present, matching text in the title/excerpt
// is highlighted, same as ToolGrid.

export default function ArticleCard({ article, query = '' }) {
  const category = getCategoryById(article.category);
  const CategoryIcon = category?.icon;

  return (
    <Link to={`/blog/${article.slug}`} className="article-card">
      <div className="article-card-cover">
        {article.coverImage ? (
          <img src={article.coverImage} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="article-card-cover-placeholder" aria-hidden="true">
            {CategoryIcon && <CategoryIcon size={30} strokeWidth={1.5} />}
          </span>
        )}
        {category && <span className="article-card-category">{category.name}</span>}
      </div>

      <div className="article-card-body">
        <h3 className="article-card-title">
          <Highlight text={article.title} query={query} />
        </h3>
        <p className="article-card-excerpt">
          <Highlight text={article.excerpt} query={query} />
        </p>

        <div className="article-card-meta">
          <span>{formatArticleDate(article.publishDate)}</span>
          <span className="article-card-meta-dot" aria-hidden="true">
            &middot;
          </span>
          <span className="article-card-meta-reading">
            <Clock size={13} aria-hidden="true" />
            {article.readingTime} min read
          </span>
          {article.difficulty && (
            <>
              <span className="article-card-meta-dot" aria-hidden="true">
                &middot;
              </span>
              <span>{DIFFICULTY_LABELS[article.difficulty] ?? article.difficulty}</span>
            </>
          )}
        </div>

        {article.tags.length > 0 && (
          <div className="tag-chip-row">
            {article.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="tag-chip">
                <Highlight text={tag} query={query} />
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
