// The daily scheduled run (05:00 UTC = 09:00 in Tbilisi).
// Phase 1: housekeeping only. The weekly digest is added in Phase 3.

import { deleteStalePending } from './subscribers.js';
import { purgeRateEvents } from './rateLimit.js';

export async function runScheduled(env, now = new Date()) {
  const deleted = await deleteStalePending(env.DB, now);
  await purgeRateEvents(env.DB, now);
  console.log(`cron ${now.toISOString()}: deleted ${deleted} unconfirmed sign-up(s)`);
  return { deleted };
}
