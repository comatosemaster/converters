import { useEffect } from 'react';

// Sets the browser tab title and the page's <meta name="description"> tag
// while a component is mounted, restoring the site's defaults on unmount -
// so navigating away (e.g. to another tool) doesn't leave a stale title
// behind. Plain DOM calls, no dependency needed for something this small.
//
// Usage: useDocumentMeta({ title: 'My Tool | Rootconverter', description: '...' });
export function useDocumentMeta({ title, description }) {
  useEffect(() => {
    const previousTitle = document.title;
    if (title) document.title = title;

    let meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? null;
    if (description) {
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', description);
    }

    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) {
        meta.setAttribute('content', previousDescription);
      }
    };
  }, [title, description]);
}
