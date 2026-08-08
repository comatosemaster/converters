// -----------------------------------------------------------------------
// SITE-WIDE SEO CONSTANTS
//
// The production domain lives here and nowhere else. That matters more
// than it looks: canonical URLs must always point at the real domain, and
// this site is also reachable at a *.workers.dev origin. Deriving
// canonicals from window.location would happily declare the workers.dev
// copy canonical and split every page's ranking signals in two.
//
// So canonicals are built from SITE_URL, always, in every environment -
// including localhost, where a canonical pointing at production is the
// correct and harmless answer.
//
// Plain ESM with no imports, so build scripts (scripts/generate-sitemap.js)
// can use the same constants the app renders with.
// -----------------------------------------------------------------------

export const SITE_URL = 'https://rootconverter.com';

export const SITE_NAME = 'Rootconverter';

export const SITE_TAGLINE = 'Free Online Tools & Converters';

export const SITE_DESCRIPTION =
  'A collection of fast, free, privacy-first online tools. Convert images, format JSON, generate QR codes, decode tokens, and more - everything runs in your browser, with no uploads and no sign-up.';

/** Default social sharing image (1200x630). Overridable per page. */
export const DEFAULT_OG_IMAGE = '/og-default.png';

/** Search engines truncate around here; used to pick the longest title that fits. */
export const TITLE_MAX = 60;

export const META_DESCRIPTION_MIN = 110;
export const META_DESCRIPTION_MAX = 160;

/**
 * Joins a path onto the production origin.
 * Always absolute, never protocol-relative, never a dev host.
 */
export function absoluteUrl(pathname = '/') {
  if (!pathname.startsWith('/')) return `${SITE_URL}/${pathname}`;
  // Trailing slashes are stripped (except the root) so that /tool/x and
  // /tool/x/ can never produce two different canonical values.
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return `${SITE_URL}${normalized}`;
}
