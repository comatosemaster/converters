// -----------------------------------------------------------------------
// PER-PAGE <head> TAGS
//
// The one definition of which tags a page's metadata becomes. It is used
// twice:
//   - at build time, renderHeadTags() writes them as an HTML string into
//     each prerendered page (scripts/prerender.js), so crawlers that never
//     run JavaScript still get the page's real title, description,
//     canonical, social card and structured data;
//   - in the browser, useDocumentMeta() applies the same list to the live
//     document when the visitor navigates between pages.
// One list for both means the static HTML and the in-app result can't
// drift apart.
//
// Every tag carries a `data-page-meta` attribute. That's how the browser
// side finds and replaces the previous page's tags - including the ones
// the prerendered HTML started with - instead of piling new ones on top.
// -----------------------------------------------------------------------

import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl } from './siteConfig.js';

export const PAGE_META_ATTR = 'data-page-meta';

// Social images are always absolute and on the production host, for the
// same reason canonicals are (see siteConfig.js).
function toAbsolute(url) {
  return /^https?:\/\//.test(url) ? url : absoluteUrl(url);
}

/**
 * Turns a page's metadata into a list of tag descriptors:
 *   { tag: 'meta' | 'link' | 'script', attrs: {...}, text?: string }
 * The <title> is handled separately (document.title / renderHeadTags),
 * since there is only ever one.
 */
export function headTags({ title, description, canonical, image, type = 'website', robots, jsonLd }) {
  const tags = [];
  const meta = (attr, key, content) => {
    if (content) tags.push({ tag: 'meta', attrs: { [attr]: key, content } });
  };

  const url = canonical ? absoluteUrl(canonical) : null;
  const imageUrl = image ? toAbsolute(image) : null;

  meta('name', 'description', description);
  meta('name', 'robots', robots);
  if (url) tags.push({ tag: 'link', attrs: { rel: 'canonical', href: url } });

  meta('property', 'og:site_name', SITE_NAME);
  meta('property', 'og:type', type);
  meta('property', 'og:url', url);
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:image', imageUrl);
  // Dimensions are only known for the shared default card.
  if (image === DEFAULT_OG_IMAGE) {
    meta('property', 'og:image:width', '1200');
    meta('property', 'og:image:height', '630');
  }

  meta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
  meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', description);
  meta('name', 'twitter:image', imageUrl);

  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  for (const schema of schemas) {
    // "<" is escaped so a stray "</script>" inside a string value can never
    // end the script tag early.
    tags.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      text: JSON.stringify(schema).replace(/</g, '\\u003c'),
    });
  }

  return tags;
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The same tags as an HTML string, for the prerendered files. */
export function renderHeadTags(meta) {
  const lines = [`<title>${escapeText(meta.title)}</title>`];
  for (const { tag, attrs, text } of headTags(meta)) {
    const attrString = Object.entries({ ...attrs, [PAGE_META_ATTR]: '' })
      .map(([key, value]) => (value === '' ? key : `${key}="${escapeAttr(value)}"`))
      .join(' ');
    lines.push(tag === 'script' ? `<script ${attrString}>${text}</script>` : `<${tag} ${attrString} />`);
  }
  return lines.join('\n    ');
}
