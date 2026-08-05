import { Link } from 'react-router-dom';

// Shown for unknown routes, and for /tool/:id where :id doesn't match
// anything in the registry (e.g. a typo or an old bookmarked link).

export default function NotFound() {
  return (
    <section className="not-found">
      <h1>Page not found</h1>
      <p>We couldn't find what you were looking for.</p>
      <Link to="/">&larr; Back to all tools</Link>
    </section>
  );
}
