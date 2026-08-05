import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import CategoryPage from './pages/CategoryPage.jsx';
import ToolPage from './pages/ToolPage.jsx';
import NotFound from './pages/NotFound.jsx';

// Top-level routing. Layout wraps every page (header/nav/footer). Routes:
// the homepage, one page per category, a dynamic route that renders any
// tool by id, and a catch-all for bad URLs.
//
// This uses react-router's "data router" form (createBrowserRouter +
// RouterProvider) rather than the plainer <BrowserRouter>/<Routes> JSX form.
// They render the same pages the same way — the reason for the data router
// is that it's what unlocks useBlocker(), which is what lets a tool step in
// and show its own "leave without saving?" confirmation before an in-app
// navigation (clicking another tool, going back, etc.) — see
// src/components/UnsavedChangesGuard.jsx.
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/category/:categoryId', element: <CategoryPage /> },
      { path: '/tool/:id', element: <ToolPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
