import { useLocation } from 'react-router-dom';
import { getRoute } from '../seo/routes.js';

// The route registry's entry for the URL being shown (title, description,
// breadcrumbs, structured data...), or undefined when the URL isn't a real
// page - which is each page's cue to render <NotFound />.
export function useCurrentRoute() {
  const { pathname } = useLocation();
  return getRoute(pathname);
}
