#!/usr/bin/env node
// -----------------------------------------------------------------------
// PRERENDERING
//
// Turns the app into one complete static HTML file per page, at build
// time. Each file carries the page's own <title>, description, canonical,
// social tags and structured data, and its full content - headings, text,
// the tool's interface, article bodies, every link - so search engines and
// link previews see the real page without running any JavaScript. In the
// browser, React then "hydrates" that markup (src/main.jsx) instead of
// building the page from nothing.
//
// This is NOT server-side rendering: nothing runs per request. It happens
// once, during `npm run build`, and Cloudflare serves the resulting files.
//
// How: `vite build --ssr` has already bundled src/entry-server.jsx for
// Node into dist-ssr/. For every route in the route registry
// (src/seo/routes.js) this script renders the page with React, fills
// dist/index.html's two slots (<!--app-head--> and <!--app-html-->), and
// writes the result. It also writes:
//   - dist/404.html   - served by Cloudflare WITH a 404 status for any URL
//                       that isn't one of these files (see wrangler.jsonc)
//   - dist/sitemap.xml - generated from the same registry, so it lists
//                       exactly the pages that exist
//   - dist/feed.json, dist/rss.xml - every tool and article with its
//                       publication date (also read by the email digest)
//
// Unlike the previous browser-based version, this needs no Playwright and
// runs on Cloudflare's build machines too. And it fails the build on any
// error: a deploy where every page is silently an empty shell is the bug
// this exists to fix.
// -----------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildJsonFeed, buildRss, feedItems } from './lib/feeds.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SERVER_ENTRY = path.join(ROOT, 'dist-ssr', 'entry-server.js');

const HEAD_SLOT = '<!--app-head-->';
const ROOT_SLOT = '<div id="root"><!--app-html--></div>';

// '/' -> dist/index.html, '/tool/x' -> dist/tool/x.html. Cloudflare's
// "drop-trailing-slash" handling serves dist/tool/x.html at /tool/x - the
// same no-trailing-slash form every canonical URL uses.
function outputFile(routePath) {
  return routePath === '/' ? path.join(DIST, 'index.html') : path.join(DIST, `${routePath.slice(1)}.html`);
}

function fillTemplate(template, { head, body, kind }) {
  return template
    .replace(HEAD_SLOT, head)
    .replace(ROOT_SLOT, `<div id="root" data-prerendered="${kind}">${body}</div>`);
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (char) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[char]};`);
}

// Only <loc> and <lastmod>: Google ignores <changefreq> and <priority>.
// Pages without a trustworthy date simply have no <lastmod> - see
// scripts/lib/lastmod.js.
function buildSitemap(routes) {
  const urls = routes.map((route) =>
    [
      '  <url>',
      `    <loc>${xmlEscape(route.url)}</loc>`,
      route.lastmod ? `    <lastmod>${route.lastmod}</lastmod>` : null,
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

async function main() {
  const { render, ROUTES, UTILITY_ROUTES, NOT_FOUND_META, renderHeadTags } = await import(pathToFileURL(SERVER_ENTRY).href);

  // Read once, before anything is written: dist/index.html is both the
  // template and the homepage's own output file.
  const template = await readFile(path.join(DIST, 'index.html'), 'utf8');
  if (!template.includes(HEAD_SLOT) || !template.includes(ROOT_SLOT)) {
    throw new Error(`dist/index.html is missing ${HEAD_SLOT} or ${ROOT_SLOT} - check index.html`);
  }

  const pages = new Map();
  for (const route of ROUTES) {
    // eslint-disable-next-line no-await-in-loop -- sequential keeps a failure attributable to one route
    const body = await render(route.path);
    pages.set(outputFile(route.path), fillTemplate(template, { head: renderHeadTags(route), body, kind: 'page' }));
  }

  // Real pages that shouldn't be indexed (where email links land). Built
  // the same way, but noindex and left out of the sitemap.
  for (const route of UTILITY_ROUTES) {
    // eslint-disable-next-line no-await-in-loop
    const body = await render(route.path);
    pages.set(outputFile(route.path), fillTemplate(template, { head: renderHeadTags(route), body, kind: 'utility' }));
  }

  // The 404 page. The path is only a placeholder - any URL with no file
  // gets this same HTML - which is why main.jsx renders it afresh rather
  // than hydrating it.
  const notFoundBody = await render('/404');
  pages.set(
    path.join(DIST, '404.html'),
    fillTemplate(template, { head: renderHeadTags(NOT_FOUND_META), body: notFoundBody, kind: '404' }),
  );

  for (const [file, html] of pages) {
    // eslint-disable-next-line no-await-in-loop
    await mkdir(path.dirname(file), { recursive: true });
    // eslint-disable-next-line no-await-in-loop
    await writeFile(file, html, 'utf8');
  }

  await writeFile(path.join(DIST, 'sitemap.xml'), buildSitemap(ROUTES), 'utf8');

  // Every tool and article with its publication date - for feed readers,
  // and read by the Worker's weekly email digest (see lib/feeds.js).
  const items = feedItems(ROUTES);
  const siteUrl = new URL(ROUTES[0].url).origin;
  await writeFile(path.join(DIST, 'feed.json'), buildJsonFeed(items, siteUrl), 'utf8');
  await writeFile(path.join(DIST, 'rss.xml'), buildRss(items, siteUrl), 'utf8');

  console.log(
    `prerender: ${ROUTES.length} pages + ${UTILITY_ROUTES.length} noindex pages + 404.html + sitemap.xml (${ROUTES.length} URLs) + feed.json/rss.xml (${items.length} items) written to dist/`,
  );
}

main().catch((error) => {
  console.error('prerender failed:', error);
  process.exit(1);
});
