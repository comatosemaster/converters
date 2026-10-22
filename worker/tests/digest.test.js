import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from './helpers/fakeD1.js';
import { digestCutoff, isDigestDay, parseFeed, runDigest, selectDigestItems } from '../lib/digest.js';
import { digestSubject } from '../lib/emails.js';
import { buildJsonFeed, feedItems } from '../../scripts/lib/feeds.js';

const MONDAY = new Date('2026-11-02T05:00:00.000Z');
const TUESDAY = new Date('2026-11-03T05:00:00.000Z');
const NEXT_MONDAY = new Date('2026-11-09T05:00:00.000Z');

const item = (type, title, publishedAt) => ({ type, title, url: `https://neatsize.com/${type === 'tool' ? 'tool' : 'blog'}/${title.toLowerCase().replace(/ /g, '-')}`, description: `${title} description`, publishedAt });

// --- Pure selection ---------------------------------------------------------------

test('items after the cutoff, up to today; tools first, newest first', () => {
  const items = [
    item('article', 'Old guide', '2026-10-20'),
    item('tool', 'Old tool', '2026-10-26'),
    item('article', 'New guide', '2026-10-30'),
    item('tool', 'Newer tool', '2026-11-01'),
    item('tool', 'New tool', '2026-10-28'),
    item('tool', 'Future tool', '2026-11-05'),
  ];
  const picked = selectDigestItems(items, { cutoff: '2026-10-26', now: MONDAY });
  assert.deepEqual(picked.map((i) => i.title), ['Newer tool', 'New tool', 'New guide']);
  assert.equal(digestCutoff(picked), '2026-11-01');
  assert.equal(digestSubject(picked), 'New on NeatSize: Newer tool + 2 more');
  assert.equal(digestSubject(picked.slice(0, 1)), 'New on NeatSize: Newer tool');
});

test('items dated the same day as the previous cutoff are not repeated, the next day are included', () => {
  const items = [item('tool', 'A', '2026-11-01'), item('tool', 'B', '2026-11-02')];
  assert.deepEqual(selectDigestItems(items, { cutoff: '2026-11-01', now: MONDAY }).map((i) => i.title), ['B']);
});

test('the very first digest only looks back 7 days', () => {
  const items = [item('tool', 'Ancient', '2026-08-06'), item('tool', 'Recent', '2026-10-30')];
  assert.deepEqual(selectDigestItems(items, { cutoff: null, now: MONDAY }).map((i) => i.title), ['Recent']);
});

test('feed.json round trip: what the build writes is what the digest reads', () => {
  const routes = [
    { url: 'https://neatsize.com/tool/a', feed: { type: 'tool', title: 'A', description: 'Tool A', publishedAt: '2026-10-30' } },
    { url: 'https://neatsize.com/blog/b', feed: { type: 'article', title: 'B', description: 'Guide B', publishedAt: '2026-10-31' } },
    { url: 'https://neatsize.com/category/x', feed: null },
  ];
  const parsed = parseFeed(JSON.parse(buildJsonFeed(feedItems(routes), 'https://neatsize.com')));
  assert.deepEqual(parsed, [
    { type: 'article', title: 'B', url: 'https://neatsize.com/blog/b', description: 'Guide B', publishedAt: '2026-10-31' },
    { type: 'tool', title: 'A', url: 'https://neatsize.com/tool/a', description: 'Tool A', publishedAt: '2026-10-30' },
  ]);
});

test('digest day is Monday (UTC)', () => {
  assert.equal(isDigestDay(MONDAY), true);
  assert.equal(isDigestDay(TUESDAY), false);
});

// --- Sending, against the real SQL with Resend's HTTP API mocked -----------------------

let calls;
let failNext;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  failNext = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, idempotencyKey: init.headers['idempotency-key'] });
    if (failNext > 0) {
      failNext -= 1;
      return new Response('{"message":"boom"}', { status: 500 });
    }
    return new Response(JSON.stringify({ data: body.map((_, i) => ({ id: `e${i}` })) }), { status: 200 });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const FEED_ITEMS = [item('tool', 'Shiny Tool', '2026-10-30'), item('article', 'Handy Guide', '2026-10-31'), item('tool', 'PDF Split', '2026-10-29')];
const feed = (items = FEED_ITEMS) => async () => JSON.parse(buildJsonFeed(items, 'https://neatsize.com'));

async function setup(subscriberCount, extraEnv = {}) {
  const db = createFakeD1();
  for (let i = 1; i <= subscriberCount; i += 1) {
    await db
      .prepare(
        "INSERT INTO subscribers (email, status, unsub_token, created_at, confirmed_at) VALUES (?1, 'active', ?2, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')",
      )
      .bind(`s${i}@resend.dev`, `tok${String(i).padStart(40, '0')}`)
      .run();
  }
  // Someone pending and someone unsubscribed must never get it.
  await db.prepare("INSERT INTO subscribers (email, status, unsub_token, created_at) VALUES ('pending@resend.dev', 'pending', 'p', '2026-10-30T00:00:00Z')").run();
  await db.prepare("INSERT INTO subscribers (email, status, unsub_token, created_at, confirmed_at) VALUES ('gone@resend.dev', 'unsubscribed', 'g', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')").run();
  const env = { DB: db, RESEND_API_KEY: 'k', RESEND_API_URL: 'https://fake.resend', SITE_URL: 'https://neatsize.com', ...extraEnv };
  return { db, env };
}

const sentTo = () => calls.flatMap((call) => call.body.map((email) => email.to));

test('first Monday: digest created and sent to active subscribers only, each with their own unsubscribe link', async () => {
  const { db, env } = await setup(3);
  const result = await runDigest(env, { now: MONDAY, loadFeed: feed() });
  assert.equal(result.action, 'created');
  assert.equal(result.sent, 3);
  assert.equal(result.remaining, 0);
  assert.deepEqual(sentTo(), ['s1@resend.dev', 's2@resend.dev', 's3@resend.dev']);

  const email = calls[0].body[0];
  assert.equal(email.subject, 'New on NeatSize: Shiny Tool + 2 more');
  assert.equal(email.headers['List-Unsubscribe'], `<https://neatsize.com/api/unsubscribe?token=tok${'1'.padStart(40, '0')}>`);
  assert.equal(email.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(email.html.includes('New tools') && email.html.includes('New guides'));
  assert.ok(email.text.includes('utm_source=newsletter'));
  assert.notEqual(calls[0].body[0].headers['List-Unsubscribe'], calls[0].body[1].headers['List-Unsubscribe']);
  assert.ok(calls[0].idempotencyKey.startsWith('digest-1-'));

  const digest = await db.prepare('SELECT * FROM digests').first();
  assert.equal(digest.status, 'complete');
  assert.equal(digest.recipient_count, 3);
  assert.equal(digest.item_count, 3);
  assert.equal(digest.cutoff, '2026-10-31');

  // Same Monday run again (e.g. a retry): nothing new, nobody emailed twice.
  calls = [];
  assert.equal((await runDigest(env, { now: MONDAY, loadFeed: feed() })).action, 'nothing-new');
  assert.equal(calls.length, 0);
});

test('nothing new: nothing sent, nothing recorded', async () => {
  const { db, env } = await setup(2);
  const result = await runDigest(env, { now: MONDAY, loadFeed: feed([item('tool', 'Old', '2026-08-01')]) });
  assert.equal(result.action, 'nothing-new');
  assert.equal(calls.length, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM digests').first()).n, 0);
});

test('not Monday and nothing partial: does nothing', async () => {
  const { env } = await setup(2);
  assert.equal((await runDigest(env, { now: TUESDAY, loadFeed: feed() })).action, 'not-digest-day');
  assert.equal(calls.length, 0);
});

test('kill switch: DIGEST_ENABLED=false', async () => {
  const { env } = await setup(2, { DIGEST_ENABLED: 'false' });
  assert.equal((await runDigest(env, { now: MONDAY, loadFeed: feed() })).action, 'disabled');
  assert.equal(calls.length, 0);
});

test('MAX_SENDS_PER_RUN: partial digest finished on the following days, no duplicates', async () => {
  const { db, env } = await setup(5, { MAX_SENDS_PER_RUN: '2' });
  let result = await runDigest(env, { now: MONDAY, loadFeed: feed() });
  assert.deepEqual([result.action, result.sent, result.remaining], ['created', 2, 3]);
  assert.equal((await db.prepare('SELECT status FROM digests').first()).status, 'partial');

  // Someone confirming after the digest was created waits for next week's.
  await db.prepare("INSERT INTO subscribers (email, status, unsub_token, created_at, confirmed_at) VALUES ('late@resend.dev', 'active', 'late', '2026-11-02T10:00:00Z', '2026-11-02T10:00:00Z')").run();

  result = await runDigest(env, { now: TUESDAY, loadFeed: feed() });
  assert.deepEqual([result.action, result.sent, result.remaining], ['resumed', 2, 1]);
  result = await runDigest(env, { now: new Date('2026-11-04T05:00:00Z'), loadFeed: feed() });
  assert.deepEqual([result.action, result.sent, result.remaining], ['resumed', 1, 0]);
  assert.equal((await db.prepare('SELECT status, recipient_count FROM digests').first()).status, 'complete');

  const recipients = sentTo();
  assert.equal(recipients.length, 5);
  assert.equal(new Set(recipients).size, 5);
  assert.ok(!recipients.includes('late@resend.dev'));
  assert.ok(!recipients.includes('pending@resend.dev') && !recipients.includes('gone@resend.dev'));
  // Each run's batch is capped at the budget.
  assert.deepEqual(calls.map((c) => c.body.length), [2, 2, 1]);

  // Next Monday: a new item -> a new digest that includes the late subscriber.
  calls = [];
  result = await runDigest(env, { now: NEXT_MONDAY, loadFeed: feed([...FEED_ITEMS, item('tool', 'Brand New', '2026-11-06')]) });
  assert.equal(result.action, 'created');
  assert.equal(calls[0].body[0].subject, 'New on NeatSize: Brand New');
  // Still 2 per run: the following days finish it, late subscriber included.
  for (let day = 10; day <= 12; day += 1) {
    await runDigest(env, { now: new Date(`2026-11-${day}T05:00:00Z`), loadFeed: feed() });
  }
  assert.equal(sentTo().length, 6);
  assert.ok(sentTo().includes('late@resend.dev'));
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM digests WHERE status = 'complete'").first()).n, 2);
});

test('batches of at most 100', async () => {
  const { env } = await setup(230, { MAX_SENDS_PER_RUN: '1000' });
  const result = await runDigest(env, { now: MONDAY, loadFeed: feed() });
  assert.equal(result.sent, 230);
  assert.deepEqual(calls.map((c) => c.body.length), [100, 100, 30]);
});

test('a failed batch leaves the digest partial for tomorrow', async () => {
  const { db, env } = await setup(3);
  failNext = 1;
  const result = await runDigest(env, { now: MONDAY, loadFeed: feed() });
  assert.equal(result.sent, 0);
  assert.ok(result.failed);
  assert.equal((await db.prepare('SELECT status FROM digests').first()).status, 'partial');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM digest_sends').first()).n, 0);
  const resumed = await runDigest(env, { now: TUESDAY, loadFeed: feed() });
  assert.deepEqual([resumed.action, resumed.sent, resumed.remaining], ['resumed', 3, 0]);
});

test('a requester whose tool shipped gets a personal line, once', async () => {
  const { db, env } = await setup(2);
  await db.prepare("INSERT INTO tool_requests (description, subscriber_id, status, shipped_slug, created_at) VALUES ('please split pdfs', 2, 'shipped', 'pdf-split', 't')").run();
  await db.prepare("INSERT INTO tool_requests (description, subscriber_id, status, created_at) VALUES ('not yet', 1, 'planned', 't')").run();
  await runDigest(env, { now: MONDAY, loadFeed: feed() });
  const [first, second] = calls[0].body;
  assert.ok(!first.html.includes('The tool you requested is live'));
  assert.ok(second.html.includes('The tool you requested is live'));
  assert.ok(second.html.includes('https://neatsize.com/tool/pdf-split'));
  assert.ok(second.text.startsWith('NeatSize\n\nThe tool you requested is live: PDF Split'));
  assert.ok((await db.prepare("SELECT notified_at FROM tool_requests WHERE shipped_slug = 'pdf-split'").first()).notified_at);
  assert.equal((await db.prepare("SELECT notified_at FROM tool_requests WHERE status = 'planned'").first()).notified_at, null);

  // Not repeated in the next digest.
  calls = [];
  await runDigest(env, { now: NEXT_MONDAY, loadFeed: feed([...FEED_ITEMS, item('tool', 'Brand New', '2026-11-06')]) });
  assert.ok(calls[0].body.every((email) => !email.html.includes('The tool you requested is live')));
});
