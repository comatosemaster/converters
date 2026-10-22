// Standalone pages that aren't tools, categories or articles. Titles and
// descriptions live here so the route registry (routes.js) - and through
// it the prerendered <head>, sitemap and verification - treats them like
// every other page.
//
// indexable: false = a page you only reach from an email link ("you're
// subscribed"). Prerendered and served normally, but noindex and left out
// of the sitemap: there's nothing on it worth finding in a search.

export const STATIC_PAGES = [
  {
    id: 'privacy',
    path: '/privacy',
    title: 'Privacy Policy',
    description:
      'What NeatSize stores and why: nothing from the tools, and for email updates only your address, sign-up dates and a hashed IP. How to delete it any time.',
    indexable: true,
  },
  {
    id: 'subscribed',
    path: '/subscribed',
    title: 'You’re subscribed',
    description: 'Your email is confirmed. You’ll get an email when new NeatSize tools or guides are published, at most once a week.',
    indexable: false,
  },
  {
    id: 'unsubscribed',
    path: '/unsubscribed',
    title: 'You’ve been unsubscribed',
    description: 'You won’t get any more NeatSize update emails. You can subscribe again any time.',
    indexable: false,
  },
];

export function getStaticPage(id) {
  return STATIC_PAGES.find((page) => page.id === id);
}
