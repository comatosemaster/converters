#!/usr/bin/env node
// -----------------------------------------------------------------------
// PRERENDERING
//
// Vite builds an empty shell: <body><div id="root"></div></body>. React
// fills it in after mount, which is fine for Googlebot (it renders
// JavaScript) and useless for everything that doesn't - Bing's fallbacks,
// most SEO auditors, and every social scraper.
//
// The symptom is an audit reporting "no H1", "no headings", "very few
// internal links" on pages that demonstrably have all three once JS runs.
//
// So after the build, each route is opened in a real browser, allowed to
// render, and its resulting HTML written back to dist/<route>/index.html.
// The static host then serves real content to everyone, and React hydrates
// over the top for actual visitors.
//
// This is NOT server-side rendering: there is no server, and nothing runs
// per request. It happens once, at build time, and the output is plain
// static files - exactly what Cloudflare's asset hosting wants.
//
// A real browser is used rather than renderToString because tool
// components are lazily loaded (see registry.js) and their explanatory
// content only exists after those chunks resolve. A Node renderer would
// capture the loading placeholder instead.
//
// Playwright is an optional dependency: if it isn't installed the build
// still succeeds, with a warning. Breaking a deploy because a prerender
// helper is missing would be a bad trade.
// -----------------------------------------------------------------------

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/registryData.js';
import { buildSitemap } from './generate-sitemap.js';
import { SITE_URL } from '../src/seo/siteConfig.js';

const DIST = path.join(REPO_ROOT, 'dist');
const PORT = 4178;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2',
};

// Minimal static server with SPA fallback - the same behaviour Cloudflare
// provides in production, so what's rendered here matches what ships.
//
// `shell` is the ORIGINAL Vite output, held in memory and served for every
// route. That matters: prerendered pages are written back into dist/, so
// reading the fallback from disk would mean later routes are rendered on
// top of an earlier route's already-rendered HTML. JSON-LD is appended
// rather than replaced, so every tool page ended up carrying the
// homepage's WebSite and Organization blocks as well as its own.
function serveDist(shell) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(DIST, url);

      // Only real build assets come off disk; anything else gets the
      // pristine shell.
      if (url !== '/' && existsSync(filePath) && path.extname(filePath) && !url.endsWith('.html')) {
        try {
          const body = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
          res.end(body);
          return;
        } catch {
          /* fall through to the shell */
        }
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(shell);
    });
    server.listen(PORT, () => resolve(server));
  });
}

// Playwright is CommonJS. Imported by bare specifier it exposes `chromium`
// as a named export; imported by absolute path (a global install) Node
// hangs everything off `default` instead - so both shapes are checked.
function pickChromium(module) {
  return module?.chromium ?? module?.default?.chromium ?? null;
}

async function loadPlaywright() {
  // A local devDependency first - that's what a CI build would have.
  for (const specifier of ['playwright', 'playwright-core']) {
    try {
      const found = pickChromium(await import(specifier));
      if (found) return found;
    } catch {
      /* try the next */
    }
  }

  // Then a global install, which is common on a developer machine.
  const globalRoot = process.env.NPM_GLOBAL_ROOT ?? process.env.npm_config_prefix;
  if (globalRoot) {
    const candidate = path.join(globalRoot, 'node_modules', 'playwright', 'index.js');
    for (const file of [candidate, path.join(globalRoot, 'playwright', 'index.js')]) {
      if (!existsSync(file)) continue;
      try {
        const found = pickChromium(await import(pathToFileURL(file).href));
        if (found) return found;
      } catch {
        /* fall through */
      }
    }
  }

  return null;
}

// No de-duplication pass is needed: useDocumentMeta updates existing tags
// in place rather than appending, so the shell's site-wide defaults are
// overwritten by the page's own values instead of sitting alongside them.

async function main() {
  const chromium = await loadPlaywright();
  if (!chromium) {
    console.warn(
      '\n  prerender: Playwright not installed - skipping.\n' +
        '  The site still works, but crawlers that do not run JavaScript will\n' +
        '  receive an empty shell. Install it with:  npm i -D playwright\n' +
        '  then:  npx playwright install chromium\n',
    );
    return;
  }

  const { entries } = await buildSitemap();
  const routes = entries.map((entry) => entry.loc.replace(SITE_URL, '') || '/');

  // Captured before anything is written, and never re-read from disk.
  const shell = await readFile(path.join(DIST, 'index.html'), 'utf8');

  const server = await serveDist(shell);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Rendered HTML is collected in memory and written only once every route
  // is done, so no output can become another route's input.
  const rendered = new Map();
  const problems = [];

  for (const route of routes) {
    // eslint-disable-next-line no-await-in-loop -- one page object reused; parallelism would need several browsers for little gain at this size
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });

    // Wait for the lazily-loaded tool chunk to replace its placeholder,
    // so the tool's explanatory content is captured too.
    // eslint-disable-next-line no-await-in-loop
    await page
      .waitForFunction(() => !document.querySelector('.tool-loading'), { timeout: 8000 })
      .catch(() => problems.push(`${route}: tool chunk did not settle`));

    // eslint-disable-next-line no-await-in-loop
    const html = await page.content();

    // eslint-disable-next-line no-await-in-loop
    const check = await page.evaluate(() => ({
      h1: document.querySelectorAll('h1').length,
      links: document.querySelectorAll('a[href^="/"]').length,
      ld: document.querySelectorAll('script[type="application/ld+json"]').length,
    }));
    if (check.h1 !== 1) problems.push(`${route}: ${check.h1} h1 elements`);
    if (check.links < 5) problems.push(`${route}: only ${check.links} internal links`);
    // More than three would mean schema is accumulating across routes -
    // the contamination bug this script's in-memory shell prevents.
    if (check.ld === 0 || check.ld > 3) problems.push(`${route}: ${check.ld} JSON-LD blocks`);

    rendered.set(route, html);
  }

  await browser.close();
  server.close();

  for (const [route, html] of rendered) {
    const outDir = route === '/' ? DIST : path.join(DIST, route);
    // eslint-disable-next-line no-await-in-loop -- sequential writes keep any failure attributable to a route
    await mkdir(outDir, { recursive: true });
    // eslint-disable-next-line no-await-in-loop
    await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
  }

  console.log(`prerender: wrote ${rendered.size} HTML files into dist/`);
  if (problems.length) {
    console.warn(`prerender: ${problems.length} warning(s):`);
    problems.slice(0, 10).forEach((p) => console.warn(`  - ${p}`));
  }
}

main().catch((error) => {
  // Never fail the build over prerendering - a shipped site that needs JS
  // beats no site at all.
  console.warn('prerender: skipped after an error -', error.message);
});
