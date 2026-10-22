// -----------------------------------------------------------------------
// THE ROUTE REGISTRY
//
// Every indexable URL on the site, with everything known about it: path,
// title, description, canonical, social image, page type, last-modified
// date, breadcrumbs and structured data.
//
// It reads everything:
//   - the router (src/router.jsx) takes its URL patterns from ROUTE_PATTERNS
//   - every page takes its <head> metadata and breadcrumbs from here
//   - the build (scripts/prerender.js) renders exactly these routes to
//     static HTML and writes sitemap.xml from them
// So the sitemap, the prerendered files and what the app shows can't
// disagree about which pages exist or what they're called.
//
// Nothing here is a hand-kept list. Routes are DERIVED from the data the
// site already has - the tool registry, its categories and the blog's
// markdown files - so adding a tool is still one entry in
// src/tools/registry.js, and adding an article is still one .md file.
//
// Deliberately absent: categories with no tools, and blog categories with
// no articles. A page that is only an empty list has nothing to rank for;
// those URLs get the real 404 instead.
// -----------------------------------------------------------------------

import { CATEGORIES, getCategoryById, tools } from '../tools/registry.js';
import { articles } from '../blog/blogUtils.js';
import {
  articleMeta,
  blogCategoryMeta,
  blogHomeMeta,
  categoryMeta,
  homeMeta,
  notFoundMeta,
  staticPageMeta,
  toolMeta,
} from './buildMeta.js';
import {
  articleSchema,
  blogSchema,
  breadcrumbSchema,
  collectionSchema,
  organizationSchema,
  toolSchema,
  webPageSchema,
  websiteSchema,
} from './structuredData.js';
import { STATIC_PAGES } from './staticPages.js';
import { absoluteUrl } from './siteConfig.js';

// The URL shape of each page type - the router's route definitions.
export const ROUTE_PATTERNS = {
  home: '/',
  category: '/category/:categoryId',
  tool: '/tool/:id',
  blog: '/blog',
  blogCategory: '/blog/category/:categoryId',
  article: '/blog/:slug',
  // Standalone pages each have their own fixed path (see staticPages.js).
  ...Object.fromEntries(STATIC_PAGES.map((page) => [page.id, page.path])),
};

// Page dates from git, baked in at build time by vite.config.js (see
// scripts/lib/lastmod.js). Empty when git couldn't give honest dates, in
// which case those pages simply have no lastmod.
const LASTMOD =
  typeof __LASTMOD__ !== 'undefined' ? __LASTMOD__ : { tools: {}, registry: null };

// The newest of some YYYY-MM-DD strings (they sort as plain text).
function newest(dates) {
  return dates.filter(Boolean).sort().pop() ?? null;
}

function articleDate(article) {
  return (article.updatedDate ?? article.publishDate).toISOString().slice(0, 10);
}

function route({ path, type, meta, breadcrumbs = null, jsonLd = [], lastmod = null }) {
  return {
    path,
    type,
    url: absoluteUrl(path),
    lastmod,
    breadcrumbs,
    // Everything useDocumentMeta / renderHeadTags consume.
    ...meta,
    canonical: path,
    jsonLd: breadcrumbs ? [...jsonLd, breadcrumbSchema(breadcrumbs)] : jsonLd,
  };
}

function buildRoutes() {
  const list = [];
  const toolDates = tools.map((tool) => LASTMOD.tools[tool.id]);

  list.push(
    route({
      path: '/',
      type: 'home',
      meta: homeMeta({ toolCount: tools.length }),
      // WebSite + Organization once, on the homepage only - repeating them
      // on every page adds nothing.
      jsonLd: [websiteSchema(), organizationSchema()],
      lastmod: newest([...toolDates, LASTMOD.registry]),
    }),
  );

  for (const category of CATEGORIES) {
    const categoryTools = tools.filter((tool) => tool.category === category.id);
    if (categoryTools.length === 0) continue;
    const path = `/category/${category.id}`;
    list.push(
      route({
        path,
        type: 'category',
        meta: categoryMeta(category, categoryTools.length),
        breadcrumbs: [{ label: 'Home', to: '/' }, { label: category.name }],
        jsonLd: [
          collectionSchema({
            name: `${category.name} Tools`,
            description: category.tagline,
            path,
            // Mirrors the tool cards the page renders, in the same order.
            items: categoryTools.map((tool) => ({ name: tool.name, path: `/tool/${tool.id}` })),
          }),
        ],
        lastmod: newest([...categoryTools.map((tool) => LASTMOD.tools[tool.id]), LASTMOD.registry]),
      }),
    );
  }

  for (const tool of tools) {
    const category = getCategoryById(tool.category);
    list.push(
      route({
        path: `/tool/${tool.id}`,
        type: 'tool',
        meta: toolMeta(tool, category),
        breadcrumbs: [
          { label: 'Home', to: '/' },
          ...(category ? [{ label: category.name, to: `/category/${category.id}` }] : []),
          { label: tool.name },
        ],
        jsonLd: [toolSchema(tool, category)],
        lastmod: LASTMOD.tools[tool.id] ?? null,
      }),
    );
  }

  if (articles.length > 0) {
    list.push(
      route({
        path: '/blog',
        type: 'blog',
        meta: blogHomeMeta(),
        jsonLd: [blogSchema()],
        lastmod: newest(articles.map(articleDate)),
      }),
    );
  }

  for (const category of CATEGORIES) {
    const categoryArticles = articles.filter((article) => article.category === category.id);
    if (categoryArticles.length === 0) continue;
    const path = `/blog/category/${category.id}`;
    list.push(
      route({
        path,
        type: 'blogCategory',
        meta: blogCategoryMeta(category, categoryArticles.length),
        breadcrumbs: [{ label: 'Home', to: '/' }, { label: 'Blog', to: '/blog' }, { label: category.name }],
        jsonLd: [
          collectionSchema({
            name: `${category.name} Articles`,
            description: `Guides and explainers on ${category.name.toLowerCase()} topics.`,
            path,
            items: categoryArticles.map((article) => ({ name: article.title, path: `/blog/${article.slug}` })),
          }),
        ],
        lastmod: newest(categoryArticles.map(articleDate)),
      }),
    );
  }

  for (const article of articles) {
    const category = getCategoryById(article.category);
    const path = `/blog/${article.slug}`;
    list.push(
      route({
        path,
        type: 'article',
        meta: articleMeta(article),
        breadcrumbs: [
          { label: 'Home', to: '/' },
          { label: 'Blog', to: '/blog' },
          ...(category ? [{ label: category.name, to: `/blog/category/${category.id}` }] : []),
          { label: article.title },
        ],
        jsonLd: [articleSchema(article, { url: absoluteUrl(path) })],
        lastmod: articleDate(article),
      }),
    );
  }

  for (const page of STATIC_PAGES.filter((entry) => entry.indexable)) {
    list.push(
      route({
        path: page.path,
        type: 'page',
        meta: staticPageMeta(page),
        breadcrumbs: [{ label: 'Home', to: '/' }, { label: page.title }],
        jsonLd: [webPageSchema({ name: page.title, description: page.description, path: page.path })],
      }),
    );
  }

  return list;
}

/** Every indexable route, in sitemap order. */
export const ROUTES = buildRoutes();

/**
 * Real pages that are NOT indexable (noindex, no canonical, not in the
 * sitemap) - the pages people land on from email links. Prerendered like
 * the rest; marked data-prerendered="utility".
 */
export const UTILITY_ROUTES = STATIC_PAGES.filter((page) => !page.indexable).map((page) => ({
  path: page.path,
  type: 'utility',
  url: absoluteUrl(page.path),
  lastmod: null,
  breadcrumbs: null,
  ...staticPageMeta(page),
  jsonLd: [],
}));

const byPath = new Map([...ROUTES, ...UTILITY_ROUTES].map((entry) => [entry.path, entry]));

/**
 * The registry entry for a URL path, or undefined if it isn't a real page.
 * A trailing slash is ignored, so /tool/x/ and /tool/x are the same page.
 */
export function getRoute(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return byPath.get(normalized);
}

/** Metadata for the 404 page - noindex and no canonical. */
export const NOT_FOUND_META = notFoundMeta();
