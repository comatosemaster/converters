// Subscriber records in D1. Status flow:
//   (new) -> pending -> active -> unsubscribed -> pending (re-subscribe) ...
// Pending sign-ups that are never confirmed are deleted after 7 days.

import { randomToken } from './crypto.js';

export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const isUniqueViolation = (error) => /UNIQUE constraint failed/i.test(String(error?.message ?? error));

/**
 * Starts (or restarts) a double opt-in for `email`. Returns:
 *   { state: 'active', id }                    - already confirmed; send nothing
 *   { state: 'pending', id, confirmToken }     - send a confirmation email
 * Fresh tokens are issued every time, so only the newest confirmation link
 * works, and the 7-day expiry restarts.
 */
export async function startSubscription(db, { email, source, ipHash, now = new Date() }, attempt = 0) {
  const existing = await db.prepare('SELECT id, status FROM subscribers WHERE email = ?1').bind(email).first();
  if (existing?.status === 'active') return { state: 'active', id: existing.id };

  const confirmToken = randomToken();
  const unsubToken = randomToken();
  const at = now.toISOString();

  try {
    if (existing) {
      await db
        .prepare(
          `UPDATE subscribers
             SET status = 'pending', confirm_token = ?1, unsub_token = ?2, source = ?3, ip_hash = ?4,
                 created_at = ?5, confirmed_at = NULL, unsubscribed_at = NULL
           WHERE id = ?6`,
        )
        .bind(confirmToken, unsubToken, source, ipHash, at, existing.id)
        .run();
      return { state: 'pending', id: existing.id, confirmToken };
    }
    const row = await db
      .prepare(
        `INSERT INTO subscribers (email, status, confirm_token, unsub_token, source, created_at, ip_hash)
         VALUES (?1, 'pending', ?2, ?3, ?4, ?5, ?6) RETURNING id`,
      )
      .bind(email, confirmToken, unsubToken, source, at, ipHash)
      .first();
    return { state: 'pending', id: row.id, confirmToken };
  } catch (error) {
    // Two sign-ups for the same address at the same moment: the other one
    // created the row - go round once more and update it instead.
    if (isUniqueViolation(error) && attempt === 0) return startSubscription(db, { email, source, ipHash, now }, 1);
    throw error;
  }
}

/** Confirms a pending sign-up. Returns true if the token matched an unexpired one. */
export async function confirmSubscription(db, token, now = new Date()) {
  const oldest = new Date(now.getTime() - PENDING_TTL_MS).toISOString();
  const row = await db
    .prepare(
      `UPDATE subscribers SET status = 'active', confirmed_at = ?1, confirm_token = NULL
        WHERE confirm_token = ?2 AND status = 'pending' AND created_at > ?3
        RETURNING id`,
    )
    .bind(now.toISOString(), token, oldest)
    .first();
  return Boolean(row);
}

/** The subscriber an unsubscribe link belongs to, or null. */
export function findByUnsubToken(db, token) {
  return db.prepare('SELECT id, email, status FROM subscribers WHERE unsub_token = ?1').bind(token).first();
}

/**
 * Unsubscribes the owner of `token`. Returns true for a real link
 * (including one that was already used), false for an unknown token.
 */
export async function unsubscribe(db, token, now = new Date()) {
  const subscriber = await findByUnsubToken(db, token);
  if (!subscriber) return false;
  if (subscriber.status !== 'unsubscribed') {
    await db
      .prepare(`UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ?1, confirm_token = NULL WHERE id = ?2`)
      .bind(now.toISOString(), subscriber.id)
      .run();
  }
  return true;
}

/** Deletes sign-ups that were never confirmed within 7 days. */
export async function deleteStalePending(db, now = new Date()) {
  const oldest = new Date(now.getTime() - PENDING_TTL_MS).toISOString();
  const stale = `SELECT id FROM subscribers WHERE status = 'pending' AND created_at <= ?1`;
  // D1 enforces foreign keys, so rows pointing at these subscribers go
  // first: a request stays on file, just no longer linked to the address;
  // send history (from before a re-subscribe) goes with the address.
  const [, , result] = await db.batch([
    db.prepare(`UPDATE tool_requests SET subscriber_id = NULL WHERE subscriber_id IN (${stale})`).bind(oldest),
    db.prepare(`DELETE FROM digest_sends WHERE subscriber_id IN (${stale})`).bind(oldest),
    db.prepare(`DELETE FROM subscribers WHERE status = 'pending' AND created_at <= ?1`).bind(oldest),
  ]);
  return result.meta?.changes ?? 0;
}

/** "jo•••@example.com" - enough to recognise your own address on the unsubscribe page. */
export function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '•••';
  return `${local.slice(0, Math.min(2, local.length))}•••@${domain}`;
}
