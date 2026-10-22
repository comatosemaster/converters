import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import CategoryPage from './pages/CategoryPage.jsx';
import ToolPage from './pages/ToolPage.jsx';
import BlogHome from './pages/BlogHome.jsx';
import BlogCategoryPage from './pages/BlogCategoryPage.jsx';
import BlogArticlePage from './pages/BlogArticlePage.jsx';
import NotFound from './pages/NotFound.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import SubscribedPage from './pages/SubscribedPage.jsx';
import UnsubscribedPage from './pages/UnsubscribedPage.jsx';
import { getToolById } from './tools/registry.js';
import { ROUTE_PATTERNS } from './seo/routes.js';

// The route tree, shared by the browser (App.jsx) and the build-time
// renderer (entry-server.jsx), so both resolve a URL to the same page.
// Layout wraps every page (header/nav/footer); the URL patterns come from
// the route registry in src/seo/routes.js.
export const routes = [
  {
    element: <Layout />,
    children: [
      { path: ROUTE_PATTERNS.home, element: <Home /> },
      { path: ROUTE_PATTERNS.category, element: <CategoryPage /> },
      { path: ROUTE_PATTERNS.tool, element: <ToolPage /> },
      { path: ROUTE_PATTERNS.blog, element: <BlogHome /> },
      { path: ROUTE_PATTERNS.blogCategory, element: <BlogCategoryPage /> },
      { path: ROUTE_PATTERNS.article, element: <BlogArticlePage /> },
      { path: ROUTE_PATTERNS.privacy, element: <PrivacyPage /> },
      { path: ROUTE_PATTERNS.subscribed, element: <SubscribedPage /> },
      { path: ROUTE_PATTERNS.unsubscribed, element: <UnsubscribedPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

// Tool UIs are code-split (see registry.js). Before a page is rendered
// from scratch - at build time, or when the browser first hydrates a
// prerendered page - its tool's code is loaded up front, so the tool
// renders in place rather than as a loading placeholder.
export function preloadForPath(pathname) {
  const match = pathname.match(/^\/tool\/([^/]+)\/?$/);
  const tool = match ? getToolById(match[1]) : null;
  return tool?.component.preload?.() ?? Promise.resolve();
}
