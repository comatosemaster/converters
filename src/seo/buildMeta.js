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
// Rootconverter" rather than the truncated "JSON Formatter, Validator &
// Fixer - Free Online Tool | Rootcon…" - the qualifier is dropped only
// when it doesn't fit, instead of always or never.
function fitTitle(candidates) {
  const withinLimit = candidates.find((candidate) => candidate.length <= TITLE_MAX);
  return withinLimit ?? candidates[candidates.length - 1];
}

// Trims to a whole word rather than mid-word, so a clipped description
// doesn't end in a fragment.
function clamp(text, max) {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).replace(/[,;:.\s]+$/, '')}…`;
}

// --- Homepage --------------------------------------------------------------

export function homeMeta({ toolCount } = {}) {
  return {
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: toolCount
      ? `${toolCount} free online tools that run entirely in your browser: image conversion, JSON formatting, encoding, calculators and more. No uploads, no sign-up, no limits.`
      : SITE_DESCRIPTION,
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
  const description = clamp(tool.metaDescription || tool.description, 160);

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
    description: clamp(description, 160),
    canonical: `/category/${category.id}`,
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

// --- Blog ------------------------------------------------------------------

export function blogHomeMeta() {
  return {
    title: `${SITE_NAME} Blog - Guides, Tutorials & Tool Tips`,
    description:
      'Practical guides on file formats, encoding, and the tools that work with them - written to explain what you are actually converting, not just how.',
    canonical: '/blog',
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

export function blogCategoryMeta(category, articleCount) {
  const title = fitTitle([
    `${category.name} Articles & Guides${SUFFIX} Blog`,
    `${category.name} Articles${SUFFIX}`,
  ]);

  // Distinct from the tool category description above, on purpose.
  const description = articleCount
    ? `${articleCount} guide${articleCount === 1 ? '' : 's'} and explainer${articleCount === 1 ? '' : 's'} on ${category.name.toLowerCase()} topics, from the ${SITE_NAME} blog.`
    : `Guides and explainers on ${category.name.toLowerCase()} topics from the ${SITE_NAME} blog.`;

  return {
    title,
    description: clamp(description, 160),
    canonical: `/blog/category/${category.id}`,
    image: DEFAULT_OG_IMAGE,
    type: 'website',
  };
}

export function articleMeta(article) {
  return {
    title: article.seoTitle ? `${article.seoTitle}${SUFFIX}` : `${article.title}${SUFFIX}`,
    description: clamp(article.metaDescription || article.description || article.excerpt, 160),
    canonical: `/blog/${article.slug}`,
    image: article.coverImage ?? DEFAULT_OG_IMAGE,
    type: 'article',
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
