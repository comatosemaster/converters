/* eslint-disable react/only-export-components -- a build-time entry point, never hot-reloaded */
import { StrictMode } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router-dom';
import { preloadForPath, routes } from './router.jsx';
import { SITE_URL } from './seo/siteConfig.js';

// The build-time renderer. `vite build --ssr` bundles this file for Node,
// and scripts/prerender.js calls render() once per route to produce the
// static HTML each page ships with. Nothing here runs on a server at
// request time - Cloudflare only ever serves the resulting files.

export { ROUTES, NOT_FOUND_META } from './seo/routes.js';
export { renderHeadTags } from './seo/headTags.js';

export async function render(pathname) {
  await preloadForPath(pathname);

  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`${SITE_URL}${pathname}`));
  if (context instanceof Response) {
    throw new Error(`Route ${pathname} answered with a redirect/response, not a page`);
  }
  const router = createStaticRouter(handler.dataRoutes, context);

  const errors = [];
  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      {/* hydrate={false}: no route has a loader, so there is no data for
          the browser to pick up - and the hydration <script> it would add
          is markup the browser's first render doesn't produce. */}
      <StaticRouterProvider router={router} context={context} hydrate={false} />
    </StrictMode>,
    {
      onError: (error) => errors.push(error),
      // React normally moves any large Suspense boundary (a tool's whole
      // UI, here) to the end of the document, leaving a loading
      // placeholder in its place and relying on a script to swap it in.
      // That's for streaming, which a static file gains nothing from - and
      // a crawler that doesn't run scripts would see the placeholder.
      // Infinity keeps every boundary inline, where it belongs.
      progressiveChunkSize: Number.POSITIVE_INFINITY,
    },
  );

  let html = '';
  for await (const chunk of prelude) html += chunk;

  // A component that throws while rendering would otherwise be swapped for
  // its Suspense fallback silently, and the page would ship without it.
  if (errors.length > 0) {
    throw new Error(`Rendering ${pathname} failed: ${errors.map((error) => error.message).join('; ')}`);
  }
  return html;
}
