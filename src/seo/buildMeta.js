// -----------------------------------------------------------------------
// PAGE METADATA
//
// One function per page type, each returning the exact object
// useDocumentMeta() consumes. Pages never assemble title strings
// themselves - that is what previously left 28 tool components each
// hand-writing their own metadata, with no way to audit titles for
// uniqueness or length.
//
// Resolution order for every field:
//
//   explicit override (registry entry / article frontmatter)
//     → generated from real data (name, category, description)
//       → site default
//
// So a new tool needs no SEO code at all, while any tool whose generated
// title reads awkwardly can override it with one registry field.
// -----------------------------------------------------------------------

import {
  DEFAULT_OG_IMAGE,
  META_DESCRIPTION_MAX,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  TITLE_MAX,
  absoluteUrl,
} from './siteConfig.js';

const SUFFIX = ` | ${SITE_NAME}`;

// Picks the most informative title that still fits in a search result.
// Candidates are ordered longest-first; the first one under the limit
// wins, and the shortest is used as a fallback if none fit.
//
// This is why tool titles read "JSON Formatter, Validator & Fixer |
// NeatSize" rather than the truncated "JSON Formatter, Validator &
// Fixer - Free Online Tool | Neat…" - the qualifier is dropped only
// when it doesn't fit, instead of always or never.
function fitTitle(candidates) {
  const withinLimit = candidates.find((candidate) => candidate.length <= TITLE_MAX);
  return withinLimit ?? candidates[candidates.length - 1];
}

// Trims to a whole word rather than mid-word, so a clipped description
// doesn't end in a fragment.
function clamp(text, max) {
  if (!text || text.length <= max) return text;
  // One short of the limit, leaving room for the ellipsis.
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).replace(/[,;:.\s]+$/, '')}…`;
}

// --- Homepage --------------------------------------------------------------

export function homeMeta({ toolCount } = {}) {
  return {
    // Same "<page> | NeatSize" shape as every other page.
    title: `${SITE_TAGLINE}${SUFFIX}`,
    description: clamp(
      toolCount
        ? `${toolCount} free online tools that run in your browser: convert images, format JSON, encode text, calculate and more. No uploads, no sign-up.`
        : SITE_DESCRIPTION,
      META_DESCRIPTION_MAX,
    ),
    canonical: '/',
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

// --- Tool pages ------------------------------------------------------------

export function toolMeta(tool, category) {
  const title =
    tool.seoTitle ??
    fitTitle([
      `${tool.name} - Free Online Tool${SUFFIX}`,
      `${tool.name}${SUFFIX}`,
      tool.name,
    ]);

  // `metaDescription` is the fuller, purpose-written copy migrated out of
  // the tool components; `description` is the shorter card text. Either
  // way it gets clamped - an earlier version clamped only the fallback,
  // which let several 200+ character descriptions through untouched.
  const description = clamp(tool.metaDescription || tool.description, META_DESCRIPTION_MAX);

  return {
    title,
    description,
    canonical: `/tool/${tool.id}`,
    image: tool.ogImage ?? DEFAULT_OG_IMAGE,
    type: 'website',
    category: category?.name,
  };
}

// --- Tool category pages ---------------------------------------------------

export function categoryMeta(category, toolCount) {
  const title = fitTitle([
    `${category.name} Tools - Free & Browser-Based${SUFFIX}`,
    `${category.name} Tools${SUFFIX}`,
  ]);

  // Deliberately NOT category.tagline. The tagline is also used by the
  // blog category page, and two indexable URLs sharing a description is a
  // duplicate-content signal - it was doing exactly that for all six
  // categories before this.
  const description = toolCount
    ? `${toolCount} free ${category.name.toLowerCase()} tools that run entirely in your browser. ${category.tagline}`
    : category.tagline;

  return {
    title,
    description: clamp(description, META_DESCRIPTION_MAX),
    canonical: `/category/${category.id}`,
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

// --- Blog ------------------------------------------------------------------

export function blogHomeMeta() {
  return {
    title: `Blog: Guides, Tutorials & Tool Tips${SUFFIX}`,
    description:
      'Practical guides on file formats, encoding, and the tools that work with them - written to explain what you are actually converting, not just how.',
    canonical: '/blog',
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

export function blogCategoryMeta(category, articleCount) {
  const title = fitTitle([
    `${category.name} Articles & Guides${SUFFIX}`,
    `${category.name} Articles${SUFFIX}`,
  ]);

  // Distinct from the tool category description above, on purpose.
  const description = articleCount
    ? `${articleCount} guide${articleCount === 1 ? '' : 's'} and explainer${articleCount === 1 ? '' : 's'} on ${category.name.toLowerCase()} topics, from the ${SITE_NAME} blog.`
    : `Guides and explainers on ${category.name.toLowerCase()} topics from the ${SITE_NAME} blog.`;

  return {
    title,
    description: clamp(description, META_DESCRIPTION_MAX),
    canonical: `/blog/category/${category.id}`,
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

export function articleMeta(article) {
  return {
    // seoTitle is the short, search-result version of the headline; the
    // full headline is only used when it happens to fit.
    title: fitTitle([`${article.seoTitle || article.title}${SUFFIX}`, `${article.title}${SUFFIX}`, article.seoTitle || article.title]),
    description: clamp(article.metaDescription || article.description || article.excerpt, META_DESCRIPTION_MAX),
    canonical: `/blog/${article.slug}`,
    image: article.coverImage ?? DEFAULT_OG_IMAGE,
    type: 'article',
  };
}

// --- Standalone pages (privacy, request a tool, sign-up results) -----------

// `indexable: false` pages (e.g. "You're subscribed") are real pages but
// have nothing to rank for: noindex, and no canonical - same treatment as
// the 404 page.
export function staticPageMeta({ title, description, path, indexable = true }) {
  return {
    title: fitTitle([`${title}${SUFFIX}`, title]),
    description: clamp(description, META_DESCRIPTION_MAX),
    canonical: indexable ? path : undefined,
    robots: indexable ? undefined : 'noindex, follow',
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

// --- Not found -------------------------------------------------------------

export function notFoundMeta() {
  return {
    title: `Page not found${SUFFIX}`,
    description: 'That page does not exist. Browse the full collection of free browser-based tools instead.',
    // No canonical: this URL should not be treated as a real page.
    // `noindex` is what actually keeps it out of the index - a static host
    // serving the SPA shell cannot return a true 404 status for a
    // client-side route (see docs/seo-audit.md §4).
    robots: 'noindex, follow',
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

export { absoluteUrl };
