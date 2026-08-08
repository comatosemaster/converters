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

// The live origin. Everything canonical, every sitemap URL, and every
// social image URL is built from this.
//
// ⚠ It must be a domain that actually resolves. A canonical pointing at a
// dead host tells search engines "the real version of this page is over
// there" - and when "there" returns nothing, the page can be dropped from
// the index entirely. That is strictly worse than having no canonical.
//
// The default is the real domain. Until it is attached, builds can point
// at the workers.dev origin instead without any code change:
//
//   SITE_URL=https://converters.mujirishvilidato6.workers.dev npm run build
//
// ⚠ While rootconverter.com does not resolve, canonicals point at a host
// that returns nothing. That is tolerable for a short window on a site
// with little index history, and must be fixed by attaching the domain -
// not by leaving canonicals pointing somewhere dead.
//
// Read from both `import.meta.env` (Vite, for the app) and `process.env`
// (Node, for scripts/generate-sitemap.js), because this module is used by
// both and they expose environment variables differently.
const fromVite =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SITE_URL : undefined;
const fromNode = typeof process !== 'undefined' && process.env ? process.env.SITE_URL : undefined;

export const SITE_URL = (fromVite || fromNode || 'https://rootconverter.com').replace(
  /\/+$/,
  '',
);

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
