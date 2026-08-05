import { Link, useParams } from 'react-router-dom';
import { CATEGORIES, getToolsByCategory } from '../tools/registry.js';
import ToolGrid from '../components/ToolGrid.jsx';
import NotFound from './NotFound.jsx';

// The dedicated page for one category, e.g. /category/text-data. Lists just
// that category's tools. Like Home.jsx, this never needs to change when a
// new tool (or even a new category) is added — it reads from the registry.

export default function CategoryPage() {
  const { categoryId } = useParams();
  const category = CATEGORIES.find((entry) => entry.id === categoryId);

  if (!category) {
    return <NotFound />;
  }

  // getToolsByCategory() groups every category's tools; pick out this one.
  const { tools } = getToolsByCategory().find((entry) => entry.id === categoryId);

  return (
    <div className="category-page">
      <Link to="/" className="back-link">
        &larr; All categories
      </Link>
      <h1>{category.name}</h1>
      <ToolGrid tools={tools} />
    </div>
  );
}
