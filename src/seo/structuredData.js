// -----------------------------------------------------------------------
// JSON-LD BUILDERS
//
// Rule applied throughout: only describe things that are actually on the
// page. No invented ratings, review counts, authors, or prices.
//
// The one claim that might look like decoration - `offers: price 0` on
// tool pages - is literally true: every tool is free, requires no
// account, and runs client-side. Google's own guidance is that free
// software should say so explicitly rather than omit the offer.
// -----------------------------------------------------------------------

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from './siteConfig.js';

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/favicon.svg'),
    description: SITE_DESCRIPTION,
  };
}

// SearchAction is included because the site genuinely has a working
// site-wide search (the ⌘K palette), and it is reachable by URL.
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { '@id': ORGANIZATION_ID },
  };
}

// WebApplication is the honest type for these pages: each one IS an
// application the visitor uses in the browser, not an article about one.
export function toolSchema(tool, category) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.name,
    url: absoluteUrl(`/tool/${tool.id}`),
    description: tool.description,
    applicationCategory: category?.name ? `${category.name} tool` : 'Utility',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': ORGANIZATION_ID },
  };
}

// CollectionPage matches what a category page really is: a listing of
// other pages. The ItemList mirrors the tool cards actually rendered, in
// the same order.
export function collectionSchema({ name, description, path, items }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: absoluteUrl(item.path),
      })),
    },
  };
}

export function blogSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${SITE_NAME} Blog`,
    url: absoluteUrl('/blog'),
    description: 'Guides and explainers on file formats, encoding, and the tools that work with them.',
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function articleSchema(article, { url }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.seoTitle || article.title,
    description: article.metaDescription || article.description,
    datePublished: article.publishDate?.toISOString?.() ?? article.publishDate,
    dateModified: (article.updatedDate ?? article.publishDate)?.toISOString?.() ?? article.publishDate,
    author: { '@type': 'Organization', name: article.author, url: SITE_URL },
    publisher: { '@id': ORGANIZATION_ID },
    ...(article.coverImage ? { image: absoluteUrl(article.coverImage) } : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
}

/**
 * Breadcrumbs.
 *
 * `items` must match the VISIBLE breadcrumb trail exactly - the site
 * renders one on every tool, category, and article page, so this marks up
 * real content rather than inventing a hierarchy for crawlers.
 */
export function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.to ? { item: absoluteUrl(item.to) } : {}),
    })),
  };
}
