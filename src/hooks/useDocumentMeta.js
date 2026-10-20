import { useEffect } from 'react';
import { PAGE_META_ATTR, headTags } from '../seo/headTags.js';

// Keeps the page's <head> in step with the page being shown.
//
// Every page is prerendered with its own <head> already filled in (see
// scripts/prerender.js), so on the first load this changes nothing a
// crawler would see. It matters when a visitor then navigates inside the
// app: the next page's title, description, canonical, social tags and
// structured data replace the previous page's.
//
// The tag list itself comes from src/seo/headTags.js - the same function
// the build uses - so in-app navigation produces exactly the head the
// prerendered file for that URL has.
//
// Usage: pages pass their entry from the route registry, e.g.
//   useDocumentMeta(useCurrentRoute());
// The not-found view passes notFoundMeta().
//
// Replace, don't restore: each page sets the WHOLE managed set, and tags
// it doesn't specify are removed. There's no "put back what was there" on
// unmount - the next page always sets its own, and restoring would keep
// e.g. a 404's noindex alive on the page after it.
export function useDocumentMeta(meta) {
  // jsonLd is an object, so the effect depends on a serialised snapshot of
  // the whole thing instead - stable across renders, but it changes
  // whenever the actual content does.
  const key = meta?.title ? JSON.stringify(meta) : '';

  useEffect(() => {
    // A page with nothing to say must say nothing. ToolPage, for one,
    // calls this unconditionally and renders NotFound for an unknown id;
    // NotFound sets the real metadata, and an empty call here must not
    // wipe it.
    if (!key) return;
    const current = JSON.parse(key);

    document.title = current.title;
    document.head.querySelectorAll(`[${PAGE_META_ATTR}]`).forEach((element) => element.remove());

    for (const { tag, attrs, text } of headTags(current)) {
      const element = document.createElement(tag);
      for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
      element.setAttribute(PAGE_META_ATTR, '');
      if (text) element.textContent = text;
      document.head.appendChild(element);
    }
  }, [key]);
}
