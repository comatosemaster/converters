// Sliding-window rate limiting stored in D1 (table rate_events).
// Default: 5 attempts per hour per hashed IP and action.

export const RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

/**
 * Records an attempt and reports whether it's within the limit. An attempt
 * over the limit is NOT recorded, so a blocked visitor's window still
 * clears an hour after their earlier attempts.
 */
export async function checkRateLimit(db, ipHash, action, { now = new Date(), limit = RATE_LIMIT.limit, windowMs = RATE_LIMIT.windowMs } = {}) {
  const since = new Date(now.getTime() - windowMs).toISOString();
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM rate_events WHERE ip_hash = ?1 AND action = ?2 AND created_at > ?3')
    .bind(ipHash, action, since)
    .first();
  if ((row?.n ?? 0) >= limit) return { allowed: false };
  await db
    .prepare('INSERT INTO rate_events (ip_hash, action, created_at) VALUES (?1, ?2, ?3)')
    .bind(ipHash, action, now.toISOString())
    .run();
  return { allowed: true };
}

/** Drops events older than a day (called by the daily cron). */
export function purgeRateEvents(db, now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  return db.prepare('DELETE FROM rate_events WHERE created_at < ?1').bind(cutoff).run();
}
