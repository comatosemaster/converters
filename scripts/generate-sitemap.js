#!/usr/bin/env node
// -----------------------------------------------------------------------
// SITEMAP GENERATION
//
// Runs at build time (see the `prebuild` script) and writes
// public/sitemap.xml from the same data the site renders from: the tool
// registry and the blog content directory.
//
// Deriving it rather than maintaining a list is the whole point - a
// hand-kept sitemap drifts the first time someone adds a tool and forgets,
// and the failure is invisible. Here, adding a registry entry or a
// markdown file updates the sitemap automatically.
//
// Only canonical, indexable URLs are included. No 404s, no query strings,
// no category pages with nothing in them.
// -----------------------------------------------------------------------

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRegistry, REPO_ROOT } from './lib/registryData.js';
import { readArticles } from './lib/blogData.js';
import { SITE_URL } from '../src/seo/siteConfig.js';

const OUTPUT = path.join(REPO_ROOT, 'public', 'sitemap.xml');

// Relative priorities. These are hints, widely reported to be largely
// ignored by Google, and are included only because they cost nothing and
// are honest: tools are the primary content, legal/utility pages are not.
const PRIORITY = { home: '1.0', tool: '0.8', category: '0.7', blog: '0.7', article: '0.6' };

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (char) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[char]};`);
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export async function buildSitemap() {
  const [{ tools, categories }, articles] = await Promise.all([readRegistry({ fresh: true }), readArticles()]);

  const entries = [];

  entries.push({ loc: `${SITE_URL}/`, changefreq: 'weekly', priority: PRIORITY.home });

  for (const tool of tools) {
    entries.push({
      loc: `${SITE_URL}/tool/${tool.id}`,
      changefreq: 'monthly',
      priority: PRIORITY.tool,
    });
  }

  // Tool categories: skipped when empty. An empty category page is a thin
  // page with nothing to rank for, and submitting it invites a
  // "crawled - currently not indexed" result that tells you nothing.
  for (const category of categories) {
    const count = tools.filter((tool) => tool.category === category.id).length;
    if (count === 0) continue;
    entries.push({
      loc: `${SITE_URL}/category/${category.id}`,
      changefreq: 'weekly',
      priority: PRIORITY.category,
    });
  }

  if (articles.length > 0) {
    const newest = articles.map((article) => isoDate(article.updatedDate ?? article.publishDate)).filter(Boolean).sort().pop();

    entries.push({ loc: `${SITE_URL}/blog`, lastmod: newest, changefreq: 'weekly', priority: PRIORITY.blog });

    // Same rule for blog categories - only those that actually have articles.
    for (const category of categories) {
      const inCategory = articles.filter((article) => article.category === category.id);
      if (inCategory.length === 0) continue;
      const lastmod = inCategory.map((a) => isoDate(a.updatedDate ?? a.publishDate)).filter(Boolean).sort().pop();
      entries.push({
        loc: `${SITE_URL}/blog/category/${category.id}`,
        lastmod,
        changefreq: 'weekly',
        priority: PRIORITY.category,
      });
    }

    for (const article of articles) {
      entries.push({
        loc: `${SITE_URL}/blog/${article.slug}`,
        lastmod: isoDate(article.updatedDate ?? article.publishDate),
        changefreq: 'monthly',
        priority: PRIORITY.article,
      });
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');

  return { xml, entries, counts: { tools: tools.length, articles: articles.length, total: entries.length } };
}

async function main() {
  const { xml, entries, counts } = await buildSitemap();

  // A duplicate URL in a sitemap is a symptom of a slug collision
  // elsewhere, so it fails the build rather than being silently deduped.
  const locs = entries.map((entry) => entry.loc);
  const duplicates = locs.filter((loc, index) => locs.indexOf(loc) !== index);
  if (duplicates.length > 0) {
    console.error(`Duplicate URLs in sitemap: ${[...new Set(duplicates)].join(', ')}`);
    process.exit(1);
  }

  await writeFile(OUTPUT, xml, 'utf8');
  console.log(
    `sitemap.xml: ${counts.total} URLs (${counts.tools} tools, ${counts.articles} articles) → ${path.relative(REPO_ROOT, OUTPUT)}`,
  );
}

// Only run when invoked directly, so the builder can also be imported by
// tests without writing a file.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generate-sitemap.js')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
