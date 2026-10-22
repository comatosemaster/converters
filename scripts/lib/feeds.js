// Builds /feed.json (JSON Feed 1.1) and /rss.xml (RSS 2.0) from the route
// registry's entries that carry `feed` data - every tool and blog post.
//
// /feed.json is also what the weekly email digest reads (the Worker fetches
// it from the deployed static assets), so the digest, the feed readers and
// the site can never disagree about what was published when.

const SITE_TITLE = 'NeatSize - new tools and guides';

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (char) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[char]};`);
}

/** Feed items, newest first: { type, title, url, description, publishedAt (YYYY-MM-DD) }. */
export function feedItems(routes) {
  return routes
    .filter((route) => route.feed?.publishedAt)
    .map((route) => ({ type: route.feed.type, title: route.feed.title, url: route.url, description: route.feed.description, publishedAt: route.feed.publishedAt }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title));
}

export function buildJsonFeed(items, siteUrl) {
  return `${JSON.stringify(
    {
      version: 'https://jsonfeed.org/version/1.1',
      title: SITE_TITLE,
      home_page_url: `${siteUrl}/`,
      feed_url: `${siteUrl}/feed.json`,
      description: 'Free tools that run in your browser, and guides on the formats behind them.',
      language: 'en',
      items: items.map((item) => ({
        id: item.url,
        url: item.url,
        title: item.title,
        summary: item.description,
        date_published: `${item.publishedAt}T00:00:00Z`,
        tags: [item.type === 'tool' ? 'Tool' : 'Guide'],
        // Extension fields (JSON Feed reserves "_" names for these) with
        // exactly what the digest needs.
        _neatsize: { type: item.type, publishedAt: item.publishedAt },
      })),
    },
    null,
    2,
  )}\n`;
}

export function buildRss(items, siteUrl) {
  const date = (day) => new Date(`${day}T00:00:00Z`).toUTCString();
  const newest = items[0]?.publishedAt;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xmlEscape(SITE_TITLE)}</title>`,
    `    <link>${xmlEscape(`${siteUrl}/`)}</link>`,
    `    <atom:link href="${xmlEscape(`${siteUrl}/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
    '    <description>Free tools that run in your browser, and guides on the formats behind them.</description>',
    '    <language>en</language>',
    newest ? `    <lastBuildDate>${date(newest)}</lastBuildDate>` : null,
    ...items.map((item) =>
      [
        '    <item>',
        `      <title>${xmlEscape(item.title)}</title>`,
        `      <link>${xmlEscape(item.url)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(item.url)}</guid>`,
        `      <description>${xmlEscape(item.description)}</description>`,
        `      <category>${item.type === 'tool' ? 'Tool' : 'Guide'}</category>`,
        `      <pubDate>${date(item.publishedAt)}</pubDate>`,
        '    </item>',
      ].join('\n'),
    ),
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}
