// -----------------------------------------------------------------------
// THE WEEKLY DIGEST
//
// Monday 05:00 UTC (09:00 in Tbilisi): announce every tool and guide
// published since the last digest, in one email per subscriber. Nothing
// new -> nothing is sent or recorded.
//
// Sending is resumable. Each run sends at most MAX_SENDS_PER_RUN emails
// (Resend's free plan allows 100 a day); a digest that couldn't reach
// everyone stays 'partial', and the daily cron finishes it on the
// following days. digest_sends records who already has it, so nobody gets
// it twice, and every Resend call carries an idempotency key as well.
//
// The pure parts (choosing items, rendering) are also used by the admin
// commands `npm run digest:preview` / `digest:test`.
// -----------------------------------------------------------------------

import { digestEmail, unsubscribeHeaders } from './emails.js';
import { BATCH_LIMIT, sendBatch } from './resend.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** JSON Feed (dist/feed.json) -> [{ type, title, url, description, publishedAt }]. */
export function parseFeed(feed) {
  return (feed?.items ?? [])
    .map((item) => ({
      type: item._neatsize?.type === 'tool' ? 'tool' : 'article',
      title: item.title,
      url: item.url,
      description: item.summary ?? '',
      publishedAt: item._neatsize?.publishedAt ?? String(item.date_published ?? '').slice(0, 10),
    }))
    .filter((item) => item.title && item.url && /^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt));
}

/**
 * The items the next digest should announce: everything published after
 * the previous digest's cutoff, up to today. The very first digest only
 * looks back 7 days - not the whole back catalogue.
 * Tools first, then guides; newest first within each.
 */
export function selectDigestItems(items, { cutoff, now = new Date() }) {
  const today = now.toISOString().slice(0, 10);
  const since = cutoff ?? new Date(now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
  const fresh = items.filter((item) => item.publishedAt > since && item.publishedAt <= today);
  const order = (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title);
  return [...fresh.filter((i) => i.type === 'tool').sort(order), ...fresh.filter((i) => i.type !== 'tool').sort(order)];
}

export function digestCutoff(items) {
  return items.reduce((max, item) => (item.publishedAt > max ? item.publishedAt : max), '');
}

/** Monday, in UTC - the cron runs at 05:00 UTC, which is Monday in Tbilisi too. */
export const isDigestDay = (now) => now.getUTCDay() === 1;

export function digestEnabled(env) {
  return String(env.DIGEST_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

export function maxSendsPerRun(env) {
  const value = Number.parseInt(env.MAX_SENDS_PER_RUN ?? '100', 10);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

/** One subscriber's email: the message plus the one-click unsubscribe headers. */
export function renderDigestFor({ items, shipped = [], unsubscribeUrl, campaign }) {
  const message = digestEmail({ items, shipped, unsubscribeUrl, campaign });
  return { ...message, headers: unsubscribeHeaders(unsubscribeUrl) };
}

function siteUrl(env) {
  return (env.SITE_URL || 'https://neatsize.com').replace(/\/+$/, '');
}

function toolTitle(items, slug) {
  return items.find((item) => item.url.endsWith(`/tool/${slug}`))?.title ?? slug.replace(/-/g, ' ');
}

/**
 * Sends (more of) a digest. Returns { sent, remaining, failed? }.
 * `budget` caps how many emails this run may send.
 */
export async function sendDigest(env, digest, { budget, now = new Date() }) {
  const db = env.DB;
  const items = JSON.parse(digest.items_json);
  const campaign = `digest-${digest.sent_at.slice(0, 10)}`;
  let sent = 0;
  let failed = null;

  while (sent < budget) {
    const limit = Math.min(BATCH_LIMIT, budget - sent);
    // Only people subscribed when the digest was created - someone
    // confirming on Tuesday waits for next week's, rather than getting a
    // week-old one during a resume.
    const { results: recipients } = await db
      .prepare(
        `SELECT s.id, s.email, s.unsub_token FROM subscribers s
          WHERE s.status = 'active' AND s.confirmed_at <= ?1
            AND NOT EXISTS (SELECT 1 FROM digest_sends d WHERE d.digest_id = ?2 AND d.subscriber_id = s.id)
          ORDER BY s.id LIMIT ?3`,
      )
      .bind(digest.sent_at, digest.id, limit)
      .all();
    if (recipients.length === 0) break;

    // Requests these people made that have shipped and not been announced
    // to them yet. (json_each keeps it to one bound parameter - D1 caps a
    // query at 100.)
    const { results: shippedRows } = await db
      .prepare(
        `SELECT id, subscriber_id, shipped_slug FROM tool_requests
          WHERE status = 'shipped' AND notified_at IS NULL AND shipped_slug IS NOT NULL
            AND subscriber_id IN (SELECT value FROM json_each(?1))`,
      )
      .bind(JSON.stringify(recipients.map((r) => r.id)))
      .all();

    const emails = recipients.map((recipient) => {
      const shipped = shippedRows
        .filter((row) => row.subscriber_id === recipient.id)
        .map((row) => ({ url: `${siteUrl(env)}/tool/${row.shipped_slug}`, title: toolTitle(items, row.shipped_slug) }));
      const unsubscribeUrl = `${siteUrl(env)}/api/unsubscribe?token=${recipient.unsub_token}`;
      return { to: recipient.email, ...renderDigestFor({ items, shipped, unsubscribeUrl, campaign }) };
    });

    try {
      await sendBatch(env, emails, `digest-${digest.id}-${recipients[0].id}-${recipients[recipients.length - 1].id}`);
    } catch (error) {
      // Leave the digest partial; tomorrow's run picks up from here.
      failed = error.message;
      console.error(`digest ${digest.id}: batch failed - ${error.message}`);
      break;
    }

    const at = now.toISOString();
    await db.batch([
      ...recipients.map((r) =>
        db.prepare('INSERT OR IGNORE INTO digest_sends (digest_id, subscriber_id, sent_at) VALUES (?1, ?2, ?3)').bind(digest.id, r.id, at),
      ),
      ...shippedRows.map((row) => db.prepare('UPDATE tool_requests SET notified_at = ?1 WHERE id = ?2').bind(at, row.id)),
      db.prepare('UPDATE digests SET recipient_count = recipient_count + ?1 WHERE id = ?2').bind(recipients.length, digest.id),
    ]);
    sent += recipients.length;
  }

  const { remaining } = await db
    .prepare(
      `SELECT COUNT(*) AS remaining FROM subscribers s
        WHERE s.status = 'active' AND s.confirmed_at <= ?1
          AND NOT EXISTS (SELECT 1 FROM digest_sends d WHERE d.digest_id = ?2 AND d.subscriber_id = s.id)`,
    )
    .bind(digest.sent_at, digest.id)
    .first();
  if (remaining === 0 && !failed) {
    await db.prepare("UPDATE digests SET status = 'complete' WHERE id = ?1").bind(digest.id).run();
  }
  return { sent, remaining, ...(failed ? { failed } : {}) };
}

/**
 * The cron's digest step. `loadFeed()` returns the parsed /feed.json.
 * Returns what happened, for the log.
 */
export async function runDigest(env, { now = new Date(), loadFeed }) {
  if (!digestEnabled(env)) return { action: 'disabled' };
  const db = env.DB;
  const budget = maxSendsPerRun(env);

  // A digest the daily limit cut short gets finished first - any day.
  const partial = await db.prepare("SELECT * FROM digests WHERE status = 'partial' ORDER BY id LIMIT 1").first();
  if (partial) return { action: 'resumed', digestId: partial.id, ...(await sendDigest(env, partial, { budget, now })) };

  if (!isDigestDay(now)) return { action: 'not-digest-day' };

  const last = await db.prepare('SELECT cutoff FROM digests ORDER BY id DESC LIMIT 1').first();
  const items = selectDigestItems(parseFeed(await loadFeed()), { cutoff: last?.cutoff ?? null, now });
  if (items.length === 0) return { action: 'nothing-new' };

  const digest = await db
    .prepare(
      `INSERT INTO digests (sent_at, item_count, recipient_count, status, cutoff, items_json)
       VALUES (?1, ?2, 0, 'partial', ?3, ?4) RETURNING *`,
    )
    .bind(now.toISOString(), items.length, digestCutoff(items), JSON.stringify(items))
    .first();
  return { action: 'created', digestId: digest.id, items: items.length, ...(await sendDigest(env, digest, { budget, now })) };
}
