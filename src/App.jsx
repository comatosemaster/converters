import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './router.jsx';

// Top-level routing for the browser. The route tree itself lives in
// router.jsx, shared with the build-time renderer (entry-server.jsx).
//
// This uses react-router's "data router" form (createBrowserRouter +
// RouterProvider) rather than the plainer <BrowserRouter>/<Routes> JSX form.
// They render the same pages the same way - the reason for the data router
// is that it's what unlocks useBlocker(), which is what lets a tool step in
// and show its own "leave without saving?" confirmation before an in-app
// navigation (clicking another tool, going back, etc.) - see
// src/components/UnsavedChangesGuard.jsx.
const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
