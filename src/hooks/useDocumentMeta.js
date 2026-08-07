import { useEffect } from 'react';

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
  jsonLd,
}) {
  // Non-primitive props (jsonLd) can't be compared by identity in the
  // effect's dependency array without every caller having to memoize it -
  // stringifying gives the effect a stable, cheap-to-compare primitive
  // that still changes whenever the actual content does.
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
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
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:site_name', siteName);
    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);

    if (canonical) {
      const absoluteUrl = new URL(canonical, window.location.origin).href;
      upsertMeta('property', 'og:url', absoluteUrl);

      let link = document.querySelector('link[rel="canonical"]');
      const isNewLink = !link;
      const previousHref = link?.getAttribute('href') ?? null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', absoluteUrl);
      cleanups.push(() => {
        if (isNewLink) link.remove();
        else if (previousHref !== null) link.setAttribute('href', previousHref);
      });
    }

    if (image) {
      const absoluteImage = new URL(image, window.location.origin).href;
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
  }, [title, description, canonical, image, type, siteName, jsonLdKey]);
}
