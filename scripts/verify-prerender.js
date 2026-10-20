#!/usr/bin/env node
// -----------------------------------------------------------------------
// PRERENDER VERIFICATION
//
// Runs at the end of `npm run build` (and alone via `npm run verify`).
// It reads the finished HTML files in dist/ as plain text - exactly what a
// crawler that doesn't run JavaScript receives - and fails the build if
// any page is missing what it needs to be indexed properly:
//
//   - a unique <title>, at most 60 characters, in "<page> | NeatSize" form
//   - a unique meta description, at most 155 characters, not truncated
//   - exactly one canonical, absolute, pointing at the page's OWN URL
//   - og:title / og:description / og:url / og:image / og:type, twitter:card
//   - valid JSON-LD of the right type for the page
//   - exactly one <h1>, and at least 100 words of real text inside <main>
//     (the sidebar and footer don't count - they're on every page)
//   - no tool UI left behind a loading placeholder
// ...plus a sitemap that lists exactly the prerendered pages, and a
// 404.html that is noindex with no canonical.
//
// Deliberately independent of the app's code: it doesn't import the route
// registry, so a bug there can't hide itself from this check.
// -----------------------------------------------------------------------

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://neatsize.com';
const BRAND_SUFFIX = ' | NeatSize';
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;
const MIN_WORDS = 100;

// Folders that hold assets, not pages.
const SKIP_DIRS = new Set(['assets', 'tesseract']);

async function findHtmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      if (!SKIP_DIRS.has(entry.name)) found.push(...(await findHtmlFiles(full)));
    } else if (entry.name.endsWith('.html')) {
      found.push(full);
    }
  }
  return found;
}

// dist/index.html -> '/', dist/tool/x.html -> '/tool/x'
function routeFor(file) {
  const relative = path.relative(DIST, file).split(path.sep).join('/');
  return relative === 'index.html' ? '/' : `/${relative.replace(/\.html$/, '')}`;
}

function decode(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function textOf(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text) {
  return text.split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decode(match[1]) : null;
}

// All <meta>/<link> tags in <head> whose `key` attribute equals `value`.
function headTags(head, element, key, value) {
  const tags = head.match(new RegExp(`<${element}\\s[^>]*>`, 'g')) ?? [];
  return tags.filter((tag) => attr(tag, key) === value);
}

function inspect(html) {
  const head = html.slice(0, html.indexOf('</head>'));
  const body = html.slice(html.indexOf('<body'));
  // Comments are dropped first so the template's explanatory comment
  // (which mentions <title>) isn't mistaken for a tag.
  const headNoComments = head.replace(/<!--[\s\S]*?-->/g, '');
  const meta = (key, value) => headTags(headNoComments, 'meta', key, value).map((tag) => attr(tag, 'content'));
  const main = body.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';
  const titles = [...headNoComments.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => decode(m[1]));
  const h1s = [...body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => textOf(m[1]));
  const jsonLd = [...headNoComments.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return { '@type': 'INVALID JSON' };
      }
    },
  );

  return {
    titles,
    descriptions: meta('name', 'description'),
    canonicals: headTags(headNoComments, 'link', 'rel', 'canonical').map((tag) => attr(tag, 'href')),
    robots: meta('name', 'robots')[0] ?? null,
    og: {
      title: meta('property', 'og:title')[0],
      description: meta('property', 'og:description')[0],
      url: meta('property', 'og:url')[0],
      image: meta('property', 'og:image')[0],
      type: meta('property', 'og:type')[0],
    },
    twitterCard: meta('name', 'twitter:card')[0],
    jsonLdTypes: jsonLd.map((schema) => schema['@type']),
    jsonLd,
    h1s,
    prerendered: body.match(/<div id="root" data-prerendered="([^"]+)"/)?.[1] ?? null,
    mainWords: countWords(textOf(main)),
    bodyWords: countWords(textOf(body)),
    // A Suspense boundary moved out of place, or a tool still loading.
    outOfOrder: /<template id="B:|\$RC|class="tool-loading"/.test(body),
  };
}

function expectedSchemas(route) {
  if (route === '/') return ['WebSite', 'Organization'];
  if (route.startsWith('/tool/')) return ['WebApplication', 'BreadcrumbList'];
  if (route.startsWith('/category/') || route.startsWith('/blog/category/')) return ['CollectionPage', 'BreadcrumbList'];
  if (route === '/blog') return ['Blog'];
  return ['BlogPosting', 'BreadcrumbList'];
}

async function main() {
  const files = await findHtmlFiles(DIST);
  const failures = [];
  const fail = (route, message) => failures.push(`${route}: ${message}`);
  const rows = [];
  const seen = { title: new Map(), description: new Map(), canonical: new Map() };

  let notFound = null;
  for (const file of files.sort()) {
    const route = routeFor(file);
    // eslint-disable-next-line no-await-in-loop
    const page = inspect(await readFile(file, 'utf8'));

    if (route === '/404') {
      notFound = page;
      continue;
    }

    const title = page.titles[0] ?? '';
    const description = page.descriptions[0] ?? '';
    const canonical = page.canonicals[0] ?? '';
    const expectedUrl = route === '/' ? `${SITE}/` : `${SITE}${route}`;
    rows.push({ route, title, description, canonical, h1: page.h1s.join(' / '), mainWords: page.mainWords, bodyWords: page.bodyWords });

    if (page.prerendered !== 'page') fail(route, 'root is not marked data-prerendered="page"');
    if (page.titles.length !== 1) fail(route, `${page.titles.length} <title> tags`);
    if (title.length > TITLE_MAX) fail(route, `title is ${title.length} chars (max ${TITLE_MAX})`);
    if (!title.endsWith(BRAND_SUFFIX)) fail(route, `title doesn't end with "${BRAND_SUFFIX}"`);
    if (page.descriptions.length !== 1) fail(route, `${page.descriptions.length} meta descriptions`);
    if (description.length > DESCRIPTION_MAX) fail(route, `description is ${description.length} chars (max ${DESCRIPTION_MAX})`);
    if (description.endsWith('…')) fail(route, 'description was truncated - rewrite it to fit');
    if (page.canonicals.length !== 1) fail(route, `${page.canonicals.length} canonical tags`);
    if (canonical !== expectedUrl) fail(route, `canonical is "${canonical}", expected "${expectedUrl}"`);
    if (page.og.url !== canonical) fail(route, `og:url "${page.og.url}" differs from canonical`);
    if (page.og.title !== title) fail(route, 'og:title differs from <title>');
    if (page.og.description !== description) fail(route, 'og:description differs from meta description');
    if (!page.og.image?.startsWith(`${SITE}/`)) fail(route, `og:image "${page.og.image}" is not on ${SITE}`);
    const expectedType = expectedSchemas(route).includes('BlogPosting') ? 'article' : 'website';
    if (page.og.type !== expectedType) fail(route, `og:type is "${page.og.type}", expected "${expectedType}"`);
    if (!page.twitterCard) fail(route, 'no twitter:card');
    if (page.robots?.includes('noindex')) fail(route, 'indexable page is marked noindex');
    if (page.h1s.length !== 1) fail(route, `${page.h1s.length} <h1> elements`);
    if (page.mainWords < MIN_WORDS) fail(route, `only ${page.mainWords} words of text in <main> (min ${MIN_WORDS})`);
    if (page.outOfOrder) fail(route, 'content left behind a loading placeholder / out-of-order boundary');

    const types = page.jsonLdTypes;
    for (const type of expectedSchemas(route)) {
      if (!types.includes(type)) fail(route, `JSON-LD is missing ${type} (has: ${types.join(', ') || 'none'})`);
    }
    if (types.includes('INVALID JSON')) fail(route, 'JSON-LD block does not parse');
    const posting = page.jsonLd.find((schema) => schema['@type'] === 'BlogPosting');
    if (posting && !(posting.headline && posting.datePublished && posting.dateModified)) {
      fail(route, 'BlogPosting lacks headline / datePublished / dateModified');
    }

    for (const [kind, value] of [['title', title], ['description', description], ['canonical', canonical]]) {
      if (seen[kind].has(value)) fail(route, `duplicate ${kind} - same as ${seen[kind].get(value)}`);
      else seen[kind].set(value, route);
    }
  }

  // The 404 page: must exist, must not be indexable, must not claim a URL.
  if (!notFound) {
    failures.push('dist/404.html is missing');
  } else {
    if (!notFound.robots?.includes('noindex')) failures.push('404.html: not marked noindex');
    if (notFound.canonicals.length > 0) failures.push('404.html: has a canonical tag');
    if (notFound.prerendered !== '404') failures.push('404.html: root is not marked data-prerendered="404"');
  }

  // Sitemap: exactly the prerendered pages, all on the production domain.
  const sitemap = await readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
  const pageUrls = rows.map((row) => (row.route === '/' ? `${SITE}/` : `${SITE}${row.route}`));
  for (const url of sitemapUrls) {
    if (!url.startsWith(`${SITE}/`)) failures.push(`sitemap: ${url} is not on ${SITE}`);
    if (!pageUrls.includes(url)) failures.push(`sitemap: ${url} has no prerendered page`);
  }
  for (const url of pageUrls) if (!sitemapUrls.includes(url)) failures.push(`sitemap: missing ${url}`);
  const withLastmod = (sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length;

  // The evidence table.
  console.log('\npath | <title> | meta description | canonical | H1 | words in <main> (whole <body>)');
  for (const row of rows) {
    console.log(
      `${row.route} | ${row.title} | ${row.description} | ${row.canonical} | ${row.h1} | ${row.mainWords} (${row.bodyWords})`,
    );
  }
  console.log(
    `\n${rows.length} pages, ${sitemapUrls.length} sitemap URLs (${withLastmod} with lastmod), 404.html: ${notFound ? `robots="${notFound.robots}", canonical tags: ${notFound.canonicals.length}` : 'MISSING'}`,
  );

  if (failures.length > 0) {
    console.error(`\nverify-prerender: ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('verify-prerender: all checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
