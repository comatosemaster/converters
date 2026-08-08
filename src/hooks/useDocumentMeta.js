import { useEffect } from 'react';
import { absoluteUrl } from '../seo/siteConfig.js';

// Sets the page's <head> tags while a component is mounted, restoring
// whatever was there before on unmount - so navigating to another page
// never leaves a stale title, description, or canonical URL behind.
//
// Every page has always called this with just { title, description } (the
// tab title + meta description) - that still works exactly as before.
// Blog article pages additionally pass `canonical`, `image`, `type:
// 'article'`, and `jsonLd` (an Article + BreadcrumbList schema object, or
// an array of schema objects) to cover the blog's richer SEO needs
// (Open Graph, Twitter Card, canonical URL, structured data) without
// every other page needing to know those fields exist.
//
// Usage:
//   useDocumentMeta({ title: 'My Tool | Rootconverter', description: '...' });
//   useDocumentMeta({
//     title, description, canonical: `/blog/${slug}`, image: coverImage,
//     type: 'article', jsonLd: [articleSchema, breadcrumbSchema],
//   });
export function useDocumentMeta({
  title,
  description,
  canonical,
  image,
  type = 'website',
  siteName = 'Rootconverter',
  // e.g. 'noindex, follow' for the not-found view. A static host serving
  // an SPA shell returns 200 for every unmatched path, so this tag is the
  // only way to keep invented URLs out of the index.
  robots,
  jsonLd,
}) {
  // Non-primitive props (jsonLd) can't be compared by identity in the
  // effect's dependency array without every caller having to memoize it -
  // stringifying gives the effect a stable, cheap-to-compare primitive
  // that still changes whenever the actual content does.
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    // A page that has nothing to say must say nothing. Pages that render a
    // fallback (ToolPage with an unknown id, say) still have to call this
    // hook unconditionally, but the child fallback owns the real metadata -
    // without this guard the parent would go on to emit og:type and
    // twitter:card for a page it isn't describing.
    if (!title && !description && !canonical && !jsonLd) return undefined;

    const previousTitle = document.title;
    if (title) document.title = title;

    const cleanups = [];

    // Creates the tag if it doesn't exist yet, or updates it in place if
    // it does - either way, remembers how to put things back on unmount.
    function upsertMeta(attr, key, content) {
      if (!content) return;
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      const isNew = !el;
      const previousContent = el?.getAttribute('content') ?? null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
      cleanups.push(() => {
        if (isNew) el.remove();
        else if (previousContent !== null) el.setAttribute('content', previousContent);
      });
    }

    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', robots);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:site_name', siteName);
    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);

    if (canonical) {
      // Resolved against the PRODUCTION origin, never window.location.
      //
      // Using the current origin would make every canonical on a
      // *.workers.dev preview declare that preview canonical - which is
      // the exact duplicate-content problem canonicals exist to prevent.
      // On localhost this correctly emits the production URL, which is
      // harmless and keeps dev honest about what will ship.
      const absolute = absoluteUrl(canonical);
      upsertMeta('property', 'og:url', absolute);

      let link = document.querySelector('link[rel="canonical"]');
      const isNewLink = !link;
      const previousHref = link?.getAttribute('href') ?? null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', absolute);
      cleanups.push(() => {
        if (isNewLink) link.remove();
        else if (previousHref !== null) link.setAttribute('href', previousHref);
      });
    }

    if (image) {
      // Same rule as the canonical: social images must point at the
      // production host, or a scraper hitting a preview deploy caches an
      // image URL that dies with the preview.
      const absoluteImage = absoluteUrl(image);
      upsertMeta('property', 'og:image', absoluteImage);
      upsertMeta('name', 'twitter:image', absoluteImage);
    }

    if (jsonLd) {
      const schemas = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      const scripts = schemas.map((schema) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schema);
        document.head.appendChild(script);
        return script;
      });
      cleanups.push(() => scripts.forEach((script) => script.remove()));
    }

    return () => {
      document.title = previousTitle;
      cleanups.forEach((cleanup) => cleanup());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jsonLdKey (a stringified snapshot) is the intentional dependency, not jsonLd itself
  }, [title, description, canonical, image, type, siteName, robots, jsonLdKey]);
}
