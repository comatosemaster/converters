// The daily scheduled run (05:00 UTC = 09:00 in Tbilisi):
//   1. housekeeping - delete sign-ups never confirmed within 7 days, and
//      rate-limit records older than a day (runs even with the digest off)
//   2. the digest - on Mondays build and send the weekly one; on other days
//      only finish a digest the daily send limit cut short.

import { deleteStalePending } from './subscribers.js';
import { purgeRateEvents } from './rateLimit.js';
import { runDigest } from './digest.js';

export async function runScheduled(env, now = new Date()) {
  const deleted = await deleteStalePending(env.DB, now);
  await purgeRateEvents(env.DB, now);

  // The feed is a static file of this same deployment (dist/feed.json),
  // read through the assets binding - no network hop.
  const loadFeed = async () => {
    const response = await env.ASSETS.fetch(new Request('https://assets.local/feed.json'));
    if (!response.ok) throw new Error(`feed.json not available (${response.status})`);
    return response.json();
  };

  let digest;
  try {
    digest = await runDigest(env, { now, loadFeed });
  } catch (error) {
    digest = { action: 'error', error: error.message };
    console.error('digest failed:', error.stack || error);
  }
  console.log(`cron ${now.toISOString()}: deleted ${deleted} unconfirmed sign-up(s); digest: ${JSON.stringify(digest)}`);
  return { deleted, digest };
}
