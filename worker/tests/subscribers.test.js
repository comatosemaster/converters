import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from './helpers/fakeD1.js';
import {
  confirmSubscription,
  deleteStalePending,
  maskEmail,
  startSubscription,
  unsubscribe,
} from '../lib/subscribers.js';
import { checkRateLimit, purgeRateEvents } from '../lib/rateLimit.js';

const T0 = new Date('2026-10-01T10:00:00.000Z');
const later = (ms) => new Date(T0.getTime() + ms);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const row = (db, email) => db.prepare('SELECT * FROM subscribers WHERE email = ?1').bind(email).first();

test('subscribe -> confirm -> unsubscribe -> resubscribe', async () => {
  const db = createFakeD1();
  const first = await startSubscription(db, { email: 'a@example.com', source: 'footer', ipHash: 'h', now: T0 });
  assert.equal(first.state, 'pending');
  assert.equal((await row(db, 'a@example.com')).status, 'pending');

  assert.equal(await confirmSubscription(db, first.confirmToken, later(HOUR)), true);
  const active = await row(db, 'a@example.com');
  assert.equal(active.status, 'active');
  assert.equal(active.confirm_token, null);
  assert.equal(active.confirmed_at, later(HOUR).toISOString());

  // A confirm link works once.
  assert.equal(await confirmSubscription(db, first.confirmToken, later(2 * HOUR)), false);

  // Signing up again while active: nothing changes, no email.
  const again = await startSubscription(db, { email: 'A@example.com'.toLowerCase(), source: 'blog', ipHash: 'h', now: later(DAY) });
  assert.deepEqual(again, { state: 'active', id: first.id });

  assert.equal(await unsubscribe(db, active.unsub_token, later(2 * DAY)), true);
  assert.equal((await row(db, 'a@example.com')).status, 'unsubscribed');
  // Using the link twice is still a success, not an error.
  assert.equal(await unsubscribe(db, active.unsub_token, later(3 * DAY)), true);

  // Re-subscribing after unsubscribing is allowed: pending again, fresh tokens.
  const back = await startSubscription(db, { email: 'a@example.com', source: 'blog', ipHash: 'h2', now: later(4 * DAY) });
  assert.equal(back.state, 'pending');
  assert.equal(back.id, first.id);
  const pending = await row(db, 'a@example.com');
  assert.equal(pending.status, 'pending');
  assert.notEqual(pending.unsub_token, active.unsub_token);
  assert.equal(pending.unsubscribed_at, null);
  assert.equal(pending.source, 'blog');
});

test('email uniqueness ignores case', async () => {
  const db = createFakeD1();
  await startSubscription(db, { email: 'case@example.com', source: 'footer', ipHash: 'h', now: T0 });
  await assert.rejects(
    db.prepare("INSERT INTO subscribers (email, status, unsub_token, created_at) VALUES ('CASE@example.com', 'pending', 'x', 'now')").run(),
    /UNIQUE/,
  );
});

test('re-requesting while pending issues a new token and invalidates the old one', async () => {
  const db = createFakeD1();
  const one = await startSubscription(db, { email: 'p@example.com', source: 'footer', ipHash: 'h', now: T0 });
  const two = await startSubscription(db, { email: 'p@example.com', source: 'footer', ipHash: 'h', now: later(HOUR) });
  assert.notEqual(one.confirmToken, two.confirmToken);
  assert.equal(await confirmSubscription(db, one.confirmToken, later(2 * HOUR)), false);
  assert.equal(await confirmSubscription(db, two.confirmToken, later(2 * HOUR)), true);
});

test('confirm links expire after 7 days; stale pending sign-ups are deleted', async () => {
  const db = createFakeD1();
  const old = await startSubscription(db, { email: 'old@example.com', source: 'footer', ipHash: 'h', now: T0 });
  const fresh = await startSubscription(db, { email: 'fresh@example.com', source: 'footer', ipHash: 'h', now: later(6 * DAY) });
  const kept = await startSubscription(db, { email: 'kept@example.com', source: 'footer', ipHash: 'h', now: T0 });
  await confirmSubscription(db, kept.confirmToken, later(HOUR));

  assert.equal(await confirmSubscription(db, old.confirmToken, later(7 * DAY + 1)), false);

  // A request linked to a stale sign-up survives, unlinked.
  await db.prepare("INSERT INTO tool_requests (description, subscriber_id, created_at) VALUES ('x', ?1, 'now')").bind(old.id).run();
  assert.equal(await deleteStalePending(db, later(7 * DAY + 1)), 1);
  assert.equal(await row(db, 'old@example.com'), null);
  assert.equal((await row(db, 'fresh@example.com')).status, 'pending');
  assert.equal((await row(db, 'kept@example.com')).status, 'active');
  assert.equal((await db.prepare('SELECT subscriber_id FROM tool_requests').first()).subscriber_id, null);
  assert.equal(await confirmSubscription(db, fresh.confirmToken, later(7 * DAY + 2)), true);
});

test('stale re-subscribe with earlier digest history is still deletable (foreign keys)', async () => {
  const db = createFakeD1();
  const s = await startSubscription(db, { email: 'h@example.com', source: 'footer', ipHash: 'h', now: T0 });
  await confirmSubscription(db, s.confirmToken, T0);
  await db.prepare("INSERT INTO digests (sent_at, item_count, status, cutoff, items_json) VALUES ('t', 1, 'complete', '2026-10-01', '[]')").run();
  await db.prepare("INSERT INTO digest_sends (digest_id, subscriber_id, sent_at) VALUES (1, ?1, 't')").bind(s.id).run();
  const subscriber = await row(db, 'h@example.com');
  await unsubscribe(db, subscriber.unsub_token, later(DAY));
  await startSubscription(db, { email: 'h@example.com', source: 'footer', ipHash: 'h', now: later(2 * DAY) });
  assert.equal(await deleteStalePending(db, later(10 * DAY)), 1);
});

test('unknown unsubscribe token', async () => {
  const db = createFakeD1();
  assert.equal(await unsubscribe(db, 'A'.repeat(43)), false);
});

test('rate limit: 5 per hour per IP hash and action, sliding window', async () => {
  const db = createFakeD1();
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await checkRateLimit(db, 'ip1', 'subscribe', { now: later(i * 60_000) })).allowed, true, `attempt ${i + 1}`);
  }
  assert.equal((await checkRateLimit(db, 'ip1', 'subscribe', { now: later(10 * 60_000) })).allowed, false);
  // Other IPs and other actions have their own budget.
  assert.equal((await checkRateLimit(db, 'ip2', 'subscribe', { now: later(10 * 60_000) })).allowed, true);
  assert.equal((await checkRateLimit(db, 'ip1', 'request', { now: later(10 * 60_000) })).allowed, true);
  // Blocked attempts aren't counted, so the window frees up an hour after the first one.
  assert.equal((await checkRateLimit(db, 'ip1', 'subscribe', { now: later(HOUR + 1) })).allowed, true);
  // Housekeeping keeps the last day only.
  await purgeRateEvents(db, later(2 * DAY));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM rate_events').first()).n, 0);
});

test('masked email for the unsubscribe page', () => {
  assert.equal(maskEmail('johnny@example.com'), 'jo•••@example.com');
  assert.equal(maskEmail('a@b.co'), 'a•••@b.co');
});
