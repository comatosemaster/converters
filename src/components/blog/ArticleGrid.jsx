import ArticleCard from './ArticleCard.jsx';

// A grid of article cards - the blog's equivalent of ToolGrid.jsx, shared
// by the blog homepage, category pages, and search results.

export default function ArticleGrid({ articles, query = '', emptyMessage = 'No articles here yet - check back soon.' }) {
  if (articles.length === 0) {
    return <p className="category-empty">{emptyMessage}</p>;
  }

  return (
    <div className="article-grid">
      {articles.map((article) => (
        <ArticleCard key={article.slug} article={article} query={query} />
      ))}
    </div>
  );
}
