// Phase 1 end-to-end: subscribe -> confirm -> unsubscribe -> resubscribe,
// through the real UI, against `wrangler dev` + local D1 + fake Resend.
//
// Prerequisites (see docs/email-and-requests-setup.md, "Testing locally"):
//   VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
//   npx wrangler d1 migrations apply neatsize-db --local
//   node worker/tests/e2e/fakeResend.mjs        (in another terminal)
//   npx wrangler dev --port 8787 --test-scheduled
//   PW=<path to playwright> node worker/tests/e2e/phase1.e2e.mjs
// Only Resend's documented test addresses (*@resend.dev) are used.

import { createRequire } from 'node:module';
import { api, check, failureCount, failNextSends, linkFrom, resetSent, sent, SITE, sql, TEST_TOKEN, triggerCron } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');

const EMAIL = 'delivered+phase1@resend.dev';

sql('DELETE FROM tool_requests; DELETE FROM digest_sends; DELETE FROM digests; DELETE FROM subscribers; DELETE FROM rate_events;');
await resetSent();

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/challenges\.cloudflare\.com|Private Access Token/i.test(m.text()) && errors.push(m.text()));
const turnstileRequests = [];
page.on('request', (r) => r.url().includes('challenges.cloudflare.com') && turnstileRequests.push(r.url()));

// --- Turnstile is lazy -------------------------------------------------------
await page.goto(`${SITE}/tool/base64-encoder-decoder`, { waitUntil: 'networkidle' });
check(turnstileRequests.length === 0, 'Turnstile is not loaded with the page');
check((await page.locator('.site-footer .subscribe-promise').innerText()).startsWith('Only your email, only for new tools and guides. Unsubscribe in one click.'), 'promise line next to the email field');
check((await page.evaluate(() => document.activeElement?.tagName)) !== 'INPUT', 'nothing is auto-focused');
await page.locator('.site-footer').scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
check(turnstileRequests.length > 0, 'Turnstile loads once the footer form scrolls into view');

// --- Subscribe from the footer ------------------------------------------------
await page.fill('#subscribe-email-footer', EMAIL);
await page.click('.site-footer .subscribe-form button[type=submit]');
await page.waitForSelector('.site-footer .subscribe-success', { timeout: 30000 });
const successText = await page.locator('.site-footer .subscribe-success').innerText();
check(successText.startsWith('Almost done'), `footer form shows success: "${successText.slice(0, 60)}…"`);

let row = sql(`SELECT * FROM subscribers WHERE email = '${EMAIL}'`)[0];
check(row?.status === 'pending' && row.source === 'footer' && /^[0-9a-f]{64}$/.test(row.ip_hash), 'stored as pending, source=footer, IP only as a hash');

let mails = await sent();
check(mails.length === 1 && mails[0].to === EMAIL && mails[0].from === 'NeatSize <updates@neatsize.com>', 'one confirmation email sent, from updates@neatsize.com');
check(Boolean(mails[0].html && mails[0].text), 'confirmation has both HTML and text versions');
check(mails[0].idempotencyKey?.startsWith('confirm-'), 'confirmation send is idempotent (keyed on its token)');
const confirmUrl = linkFrom(mails[0], '/api/confirm?token=');
check(Boolean(confirmUrl), `confirmation link: ${confirmUrl}`);

// --- Confirm --------------------------------------------------------------------
await page.goto(confirmUrl);
await page.waitForURL(`${SITE}/subscribed`);
check((await page.locator('h1').innerText()) === 'You’re subscribed', 'confirm link lands on /subscribed');
check((await page.locator('meta[name=robots]').getAttribute('content')) === 'noindex, follow', '/subscribed is noindex');
row = sql(`SELECT * FROM subscribers WHERE email = '${EMAIL}'`)[0];
check(row.status === 'active' && row.confirmed_at && row.confirm_token === null, 'status active, confirmed_at set, token cleared');

await page.goto(confirmUrl);
await page.waitForURL(`${SITE}/subscribed?status=invalid`);
await page.waitForTimeout(300);
check((await page.locator('h1').innerText()) === 'That link has expired', 'reused confirm link explains itself');

// --- Already active: same answer, no email -------------------------------------
await resetSent();
let res = await api('/api/subscribe', { email: EMAIL.toUpperCase(), source: 'footer', turnstileToken: TEST_TOKEN });
check(res.status === 200 && res.data.message === successText, 'active address: identical response (no enumeration)');
check((await sent()).length === 0, 'active address: no email sent');

// --- Unsubscribe via the button page ---------------------------------------------
const unsubUrl = `${SITE}/api/unsubscribe?token=${row.unsub_token}`;
await page.goto(unsubUrl);
check((await page.locator('h1').innerText()) === 'Unsubscribe from NeatSize updates?', 'unsubscribe link shows a confirm page');
check((await page.locator('main p').first().innerText()).startsWith('de•••@resend.dev'), 'shows a masked address');
check(sql(`SELECT status FROM subscribers WHERE email = '${EMAIL}'`)[0].status === 'active', 'just opening the link changes nothing (mail scanners)');
await page.click('button[type=submit]');
await page.waitForURL(`${SITE}/unsubscribed`);
check((await page.locator('h1').innerText()) === 'You’ve been unsubscribed', 'button lands on /unsubscribed');
row = sql(`SELECT * FROM subscribers WHERE email = '${EMAIL}'`)[0];
check(row.status === 'unsubscribed' && row.unsubscribed_at, 'status unsubscribed with timestamp');
await page.goto(unsubUrl);
await page.waitForURL(`${SITE}/unsubscribed`);
check(true, 'using the link again just shows /unsubscribed');

// --- Resubscribe from the end of a blog post ---------------------------------------
await page.goto(`${SITE}/blog/what-is-json`, { waitUntil: 'networkidle' });
const blogForm = page.locator('.article-page-main .subscribe');
check((await blogForm.locator('.subscribe-title').innerText()) === 'Get new guides by email', 'form at the end of every blog post');
await blogForm.scrollIntoViewIfNeeded();
await page.fill('#subscribe-email-blog', EMAIL);
await blogForm.locator('button[type=submit]').click();
await blogForm.locator('.subscribe-success').waitFor({ timeout: 30000 });
row = sql(`SELECT * FROM subscribers WHERE email = '${EMAIL}'`)[0];
check(row.status === 'pending' && row.source === 'blog' && row.unsubscribed_at === null, 'unsubscribed address can re-subscribe (pending again, source=blog)');
mails = await sent();
check(mails.length === 1, 're-subscribe sends a new confirmation');

// --- RFC 8058 one-click (what Gmail's own "Unsubscribe" button sends) ----------------
await page.goto(linkFrom(mails[0], '/api/confirm?token='));
row = sql(`SELECT * FROM subscribers WHERE email = '${EMAIL}'`)[0];
const oneClick = await fetch(`${SITE}/api/unsubscribe?token=${row.unsub_token}`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'List-Unsubscribe=One-Click',
});
check(oneClick.status === 200 && sql(`SELECT status FROM subscribers WHERE email = '${EMAIL}'`)[0].status === 'unsubscribed', 'one-click POST unsubscribes (no Origin needed)');
const badOneClick = await fetch(`${SITE}/api/unsubscribe?token=${'A'.repeat(43)}`, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
check(badOneClick.status === 400, 'one-click with an unknown token is refused');

// --- Abuse handling ---------------------------------------------------------------------
sql('DELETE FROM rate_events;');
res = await api('/api/subscribe', { email: 'delivered+x@resend.dev', turnstileToken: TEST_TOKEN }, { origin: 'https://evil.example' });
check(res.status === 403, 'cross-site POST refused');
res = await api('/api/subscribe', { email: 'delivered+x@resend.dev' });
check(res.status === 400 && /spam check/.test(res.data.error), 'missing Turnstile token refused');
res = await api('/api/subscribe', { email: 'not-an-email', turnstileToken: TEST_TOKEN });
check(res.status === 400, 'invalid email refused');

sql('DELETE FROM rate_events;');
const statuses = [];
for (let i = 0; i < 6; i += 1) {
  statuses.push((await api('/api/subscribe', { email: `delivered+rl${i}@resend.dev`, turnstileToken: TEST_TOKEN })).status);
}
check(JSON.stringify(statuses) === '[200,200,200,200,200,429]', `rate limit: 5 per hour per IP (${statuses})`);

sql('DELETE FROM rate_events;');
await failNextSends(1);
res = await api('/api/subscribe', { email: 'delivered+fail@resend.dev', turnstileToken: TEST_TOKEN });
check(res.status === 502 && /couldn’t send/.test(res.data.error), 'Resend outage: honest error instead of a fake success');

// --- Cron: unconfirmed sign-ups expire after 7 days -----------------------------------------
sql(`UPDATE subscribers SET created_at = '2020-01-01T00:00:00.000Z' WHERE email = 'delivered+rl0@resend.dev'`);
const before = sql(`SELECT COUNT(*) AS n FROM subscribers WHERE status = 'pending'`)[0].n;
await triggerCron();
check(sql(`SELECT COUNT(*) AS n FROM subscribers WHERE email = 'delivered+rl0@resend.dev'`)[0].n === 0, 'cron deletes pending sign-ups older than 7 days');
check(sql(`SELECT COUNT(*) AS n FROM subscribers WHERE status = 'pending'`)[0].n === before - 1, 'cron leaves recent pending sign-ups alone');

check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await browser.close();
console.log(failureCount() ? `\n${failureCount()} FAILURE(S)` : '\nALL PASSED');
process.exit(failureCount() ? 1 : 0);
