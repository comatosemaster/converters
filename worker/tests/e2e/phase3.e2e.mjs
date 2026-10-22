// Phase 3 end-to-end: feeds, the weekly digest cron, and the manual
// digest commands - against `wrangler dev` (serving dist/ with its real
// feed.json), the local D1 and the fake Resend. Same setup as phase1.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { check, failureCount, RESEND, resetSent, sent, SITE, sql, triggerCron } from './helpers.mjs';

sql('DELETE FROM tool_requests; DELETE FROM digest_sends; DELETE FROM digests; DELETE FROM subscribers; DELETE FROM rate_events;');
await resetSent();

// --- Feeds ------------------------------------------------------------------------
const feed = await (await fetch(`${SITE}/feed.json`)).json();
const rss = await (await fetch(`${SITE}/rss.xml`)).text();
check(feed.version === 'https://jsonfeed.org/version/1.1' && feed.items.length >= 70, `/feed.json: JSON Feed 1.1 with ${feed.items.length} items`);
check(feed.items.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item._neatsize.publishedAt) && ['tool', 'article'].includes(item._neatsize.type)), 'every item has a type and a real publishedAt');
check(feed.items.find((i) => i.url.endsWith('/tool/base64-encoder-decoder'))?._neatsize.publishedAt === '2026-08-05', 'tools carry their real (git) publication date');
check((rss.match(/<item>/g) ?? []).length === feed.items.length && rss.includes('<atom:link href="https://neatsize.com/rss.xml"'), '/rss.xml has the same items');
const home = await (await fetch(`${SITE}/`)).text();
check(home.includes('type="application/rss+xml"') && home.includes('type="application/feed+json"'), 'pages advertise both feeds');

// --- Subscribers + a shipped request -------------------------------------------------
for (let i = 1; i <= 3; i += 1) {
  sql(`INSERT INTO subscribers (email, status, unsub_token, source, created_at, confirmed_at)
       VALUES ('delivered+d${i}@resend.dev', 'active', 'tok${String(i).padStart(40, 'x')}', 'footer', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`);
}
sql(`INSERT INTO subscribers (email, status, unsub_token, created_at) VALUES ('delivered+pending@resend.dev', 'pending', 'pendingtoken', '2026-10-20T00:00:00Z')`);
const requester = sql("SELECT id FROM subscribers WHERE email = 'delivered+d2@resend.dev'")[0].id;
sql(`INSERT INTO tool_requests (description, subscriber_id, status, shipped_slug, created_at) VALUES ('Split my PDFs please', ${requester}, 'shipped', 'pdf-split', '2026-10-15T00:00:00Z')`);

// --- Cron on a Tuesday: housekeeping only ------------------------------------------------
await triggerCron(new Date('2026-10-27T05:00:00Z'));
check((await sent()).length === 0 && sql('SELECT COUNT(*) AS n FROM digests')[0].n === 0, 'Tuesday: no digest');

// --- Cron on Monday: the digest -----------------------------------------------------------
await triggerCron(new Date('2026-10-26T05:00:00Z'));
const mails = await sent();
const digest = sql('SELECT * FROM digests')[0];
check(mails.length === 3 && mails.every((m) => m.endpoint === '/emails/batch'), `Monday: 3 digests sent through the batch API (${mails.length})`);
check(!mails.some((m) => m.to.includes('pending')), 'pending subscribers get nothing');
const items = JSON.parse(digest?.items_json ?? '[]');
check(digest?.status === 'complete' && digest.recipient_count === 3 && items.length > 0 && items.every((i) => i.publishedAt > '2026-10-19'), `digest row complete; first digest covers only the last 7 days (${items.length} items)`);
check(mails[0].subject === `New on NeatSize: ${items[0].title} + ${items.length - 1} more`, `subject: "${mails[0].subject}"`);
check(items[0].type === 'tool' && mails[0].html.indexOf('New tools') < mails[0].html.indexOf('New guides'), 'New tools section, then New guides');
check(mails.every((m) => m.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click' && /^<http:\/\/localhost:8787\/api\/unsubscribe\?token=tok/.test(m.headers['List-Unsubscribe'])), 'each email has its own List-Unsubscribe + one-click header');
check(new Set(mails.map((m) => m.headers['List-Unsubscribe'])).size === 3, 'unsubscribe links are per person');
check(mails[0].text.includes('utm_source=newsletter'), 'links carry utm_source=newsletter');
const personal = mails.find((m) => m.to === 'delivered+d2@resend.dev');
check(personal.html.includes('The tool you requested is live') && personal.text.includes('/tool/pdf-split'), 'requester gets "the tool you requested is live"');
check(mails.filter((m) => m.html.includes('The tool you requested is live')).length === 1, '...and nobody else does');
check(Boolean(sql("SELECT notified_at FROM tool_requests WHERE shipped_slug = 'pdf-split'")[0].notified_at), 'request marked notified');

// --- Same Monday again (retry / duplicate trigger) ---------------------------------------------
await resetSent();
await triggerCron(new Date('2026-10-26T05:30:00Z'));
check((await sent()).length === 0 && sql('SELECT COUNT(*) AS n FROM digests')[0].n === 1, 'running again sends nothing and records nothing');

// --- One-click unsubscribe straight from the digest header --------------------------------------
const unsubUrl = mails[0].headers['List-Unsubscribe'].slice(1, -1);
const oneClick = await fetch(unsubUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
check(oneClick.status === 200 && sql(`SELECT status FROM subscribers WHERE email = '${mails[0].to}'`)[0].status === 'unsubscribed', 'the digest’s one-click unsubscribe works');

// --- Next Monday with nothing new: skipped ---------------------------------------------------------
await triggerCron(new Date('2026-11-02T05:00:00Z'));
check((await sent()).length === 0 && sql('SELECT COUNT(*) AS n FROM digests')[0].n === 1, 'next Monday, nothing new: skipped, nothing recorded');

// --- npm run digest:preview with fake feed items -------------------------------------------------
const dir = mkdtempSync(path.join(tmpdir(), 'digest-'));
const fakeFeed = path.join(dir, 'feed.json');
writeFileSync(
  fakeFeed,
  JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    items: [
      { url: 'https://neatsize.com/tool/fake-one', title: 'Fake Tool One', summary: 'A pretend tool', date_published: '2026-11-04T00:00:00Z', _neatsize: { type: 'tool', publishedAt: '2026-11-04' } },
      { url: 'https://neatsize.com/blog/fake-guide', title: 'Fake Guide', summary: 'A pretend guide', date_published: '2026-11-05T00:00:00Z', _neatsize: { type: 'article', publishedAt: '2026-11-05' } },
      { url: 'https://neatsize.com/tool/old', title: 'Already Sent', summary: 'old', date_published: '2026-10-21T00:00:00Z', _neatsize: { type: 'tool', publishedAt: '2026-10-21' } },
    ],
  }),
);
const run = (script, extra = [], env = {}) =>
  execFileSync(process.execPath, ['--env-file-if-exists=.env', `scripts/admin/${script}`, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const previewOut = run('digest.js', ['preview', '--local', '--feed', fakeFeed, '--date', '2026-11-09']);
check(previewOut.includes('"New on NeatSize: Fake Tool One + 1 more"') && !previewOut.includes('Already Sent'), 'preview picks only items newer than the last digest');
check(previewOut.includes('Would go to 2 active subscriber(s)'), 'preview prints the recipient count');
const html = readFileSync('.digest-preview/next-digest.html', 'utf8');
check(html.includes('Fake Tool One') && html.includes('Fake Guide'), 'preview HTML written to .digest-preview/');
check((await sent()).length === 0 && sql('SELECT COUNT(*) AS n FROM digests')[0].n === 1, 'preview sent and recorded nothing');

// --- npm run digest:test (routed to the fake Resend) -------------------------------------------------
const testOut = run('digest.js', ['test', 'delivered+me@resend.dev', '--local', '--feed', fakeFeed, '--date', '2026-11-09'], { RESEND_API_KEY: 'fake', RESEND_API_URL: RESEND });
const testMails = await sent();
check(testMails.length === 1 && testMails[0].to === 'delivered+me@resend.dev' && testMails[0].subject === '[Test] New on NeatSize: Fake Tool One + 1 more', `digest:test sends one email to one address (${testOut.trim().split('\n')[0]})`);
check(sql('SELECT COUNT(*) AS n FROM digests')[0].n === 1 && sql('SELECT COUNT(*) AS n FROM digest_sends')[0].n === 3, 'digest:test recorded nothing');
let refused = false;
try {
  run('digest.js', ['test', 'not-an-email', '--local', '--feed', fakeFeed], { RESEND_API_KEY: 'fake', RESEND_API_URL: RESEND });
} catch {
  refused = true;
}
check(refused, 'digest:test refuses an invalid address');

console.log(failureCount() ? `\n${failureCount()} FAILURE(S)` : '\nALL PASSED');
process.exit(failureCount() ? 1 : 0);
