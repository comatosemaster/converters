// Phase 2 end-to-end: "Request a Tool" with and without email, entry
// points, and the CLI admin (against the LOCAL database). Same setup as
// phase1.e2e.mjs.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { api, check, failureCount, linkFrom, resetSent, sent, SITE, sql, TEST_TOKEN } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');

sql('DELETE FROM tool_requests; DELETE FROM digest_sends; DELETE FROM digests; DELETE FROM subscribers; DELETE FROM rate_events;');
await resetSent();

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

async function submitRequest({ description, details = '', email = '', notify = false }) {
  await page.goto(`${SITE}/request-tool`, { waitUntil: 'load' });
  await page.waitForSelector('.request-form');
  await page.fill('#request-description', description);
  if (details) await page.fill('#request-details', details);
  if (email) await page.fill('#request-email', email);
  if (notify) await page.check('.request-notify input');
  await page.click('.request-form button[type=submit]');
}

// --- The page ----------------------------------------------------------------
await page.goto(`${SITE}/request-tool`, { waitUntil: 'load' });
  await page.waitForSelector('.request-form');
check((await page.locator('h1').innerText()) === 'Request a Tool', 'page renders');
check((await page.title()) === 'Request a Tool | NeatSize', 'indexable title');
check((await page.locator('link[rel=canonical]').getAttribute('href')) === 'https://neatsize.com/request-tool', 'canonical on the production domain');
check(!(await page.locator('.request-notify input').isChecked()), '"Email me when it ships" is unchecked by default');
check((await page.locator('#request-email-promise').innerText()).startsWith('Only your email, only for new tools and guides. Unsubscribe in one click.'), 'promise line next to the email field');

// --- Without email --------------------------------------------------------------
await submitRequest({ description: 'Convert EPUB ebooks to PDF', details: '.epub from Calibre' });
await page.waitForSelector('.request-done', { timeout: 30000 });
check((await page.locator('.request-done p').innerText()).startsWith('Thanks - your request is in.'), 'request without email accepted');
let rows = sql('SELECT * FROM tool_requests');
check(rows.length === 1 && rows[0].status === 'new' && rows[0].details === '.epub from Calibre' && rows[0].email === null && rows[0].subscriber_id === null && /^[0-9a-f]{64}$/.test(rows[0].ip_hash), 'stored: status new, details, no email, hashed IP');
check((await sent()).length === 0, 'no email sent');

// --- Client-side checks --------------------------------------------------------------
await submitRequest({ description: 'too short' });
await page.waitForTimeout(300);
check(
  (await page.$eval('#request-description', (el) => !el.checkValidity())) && sql('SELECT COUNT(*) AS n FROM tool_requests')[0].n === 1,
  'too-short description stopped by the browser before sending',
);
await submitRequest({ description: 'A valid request description', notify: true });
check((await page.locator('.subscribe-error').innerText()).includes('Add your email'), 'checkbox without an email refused');

// --- Email given, box NOT ticked: kept with the request, no subscription -----------------
await submitRequest({ description: 'Merge CSV files into one', email: 'delivered+noticket@resend.dev' });
await page.waitForSelector('.request-done', { timeout: 30000 });
rows = sql("SELECT * FROM tool_requests WHERE description = 'Merge CSV files into one'");
check(rows[0].email === 'delivered+noticket@resend.dev' && rows[0].subscriber_id === null, 'email stored with the request, not subscribed');
check(sql("SELECT COUNT(*) AS n FROM subscribers")[0].n === 0 && (await sent()).length === 0, 'no subscriber row and no email without the checkbox');

// --- Email + "Email me when it ships" -----------------------------------------------------------
await submitRequest({ description: 'Convert HEIC photos to PDF in one go', email: 'delivered+request@resend.dev', notify: true });
await page.waitForSelector('.request-done', { timeout: 30000 });
check((await page.locator('.request-done p').innerText()).includes('confirm your email'), 'success message asks to confirm the email');
const sub = sql("SELECT * FROM subscribers WHERE email = 'delivered+request@resend.dev'")[0];
rows = sql("SELECT * FROM tool_requests WHERE description = 'Convert HEIC photos to PDF in one go'");
check(sub?.status === 'pending' && sub.source === 'request' && rows[0].subscriber_id === sub.id, 'pending subscriber (source=request) linked to the request');
const mails = await sent();
check(mails.length === 1 && mails[0].subject === 'Confirm your email - we’ll tell you when your tool ships', `confirmation subject mentions the request: "${mails[0]?.subject}"`);
check(mails[0].text.includes('Thanks for requesting a tool: “Convert HEIC photos to PDF in one go”'), 'confirmation text quotes their request');
await page.goto(linkFrom(mails[0], '/api/confirm?token='));
check(sql(`SELECT status FROM subscribers WHERE id = ${sub.id}`)[0].status === 'active', 'confirming activates the subscription');

// --- An already-active subscriber asking again: linked, no new email ------------------------------
await resetSent();
let res = await api('/api/request-tool', { description: 'Another idea from the same person', email: 'delivered+request@resend.dev', notify: true, turnstileToken: TEST_TOKEN });
check(res.status === 200 && (await sent()).length === 0, 'active subscriber: request linked, no confirmation email');

// --- API validation + limits ----------------------------------------------------------------------
res = await api('/api/request-tool', { description: 'x'.repeat(1001), turnstileToken: TEST_TOKEN });
check(res.status === 400, 'description over 1000 chars refused by the API');
res = await api('/api/request-tool', { description: 'A perfectly fine description' });
check(res.status === 400 && /spam check/.test(res.data.error), 'missing Turnstile token refused');
sql('DELETE FROM rate_events;');
const statuses = [];
for (let i = 0; i < 6; i += 1) {
  statuses.push((await api('/api/request-tool', { description: `Rate limit probe number ${i}`, turnstileToken: TEST_TOKEN })).status);
}
check(JSON.stringify(statuses) === '[200,200,200,200,200,429]', `rate limit: 5 per hour per IP (${statuses})`);
sql("DELETE FROM tool_requests WHERE description LIKE 'Rate limit probe%'; DELETE FROM rate_events;");

// --- Entry points ------------------------------------------------------------------------------------
await page.goto(`${SITE}/tool/pdf-merge`, { waitUntil: 'networkidle' });
check((await page.locator('header a.nav-request-link[href="/request-tool"]').count()) === 1, 'nav link in the header');
check((await page.locator('.tool-request-link a[href="/request-tool"]').count()) === 1, 'small link under the tool');
check((await page.locator('.site-footer a[href="/request-tool"]').count()) === 1, 'footer link');
await page.goto(`${SITE}/category/developer`, { waitUntil: 'networkidle' });
check((await page.locator('.tool-grid a.tool-card-request').last().innerText()).includes('Missing a tool? Request it'), 'request card ends the category grid');
await page.goto(`${SITE}/`, { waitUntil: 'networkidle' });
check((await page.locator('.tool-card-request').count()) === 1 && (await page.locator('.cta-panel a[href="/request-tool"]').count()) === 1, 'homepage: card after all tools + CTA button');
await page.fill('.hero-search input', 'zzzz-no-such-tool');
check((await page.locator('.tool-card-request').count()) === 1, 'search with no results offers the request card');

// --- CLI admin (local database) ------------------------------------------------------------------------
const cli = (...argv) => {
  try {
    return { ok: true, out: execFileSync(process.execPath, ['scripts/admin/requests.js', ...argv, '--local'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { ok: false, out: `${error.stdout}${error.stderr}` };
  }
};
const listed = cli('list');
check(listed.ok && listed.out.includes('Convert EPUB ebooks to PDF') && listed.out.includes('wants a heads-up (active)'), 'npm run requests lists new requests, with subscription state');
const heic = sql("SELECT id FROM tool_requests WHERE description = 'Convert HEIC photos to PDF in one go'")[0].id;
const epub = sql("SELECT id FROM tool_requests WHERE description = 'Convert EPUB ebooks to PDF'")[0].id;
check(cli('status', String(epub), 'planned').ok && sql(`SELECT status FROM tool_requests WHERE id = ${epub}`)[0].status === 'planned', 'request:status -> planned');
check(!cli('status', String(epub), 'shipped').ok, 'request:status refuses "shipped" (use request:ship)');
check(!cli('status', 'abc', 'planned').ok && !cli('status', `${epub}; DROP TABLE subscribers`, 'planned').ok, 'non-numeric / injected ids refused');
check(!cli('ship', String(heic), 'no-such-tool').ok, 'request:ship refuses a slug that is not in the registry');
check(!cli('ship', String(heic), "x'; DROP TABLE x;--").ok, 'request:ship refuses malformed slugs');
const shipped = cli('ship', String(heic), 'pdf-split');
const row = sql(`SELECT * FROM tool_requests WHERE id = ${heic}`)[0];
check(shipped.ok && row.status === 'shipped' && row.shipped_slug === 'pdf-split' && row.notified_at === null, 'request:ship -> shipped, slug set, not yet notified');
check(sql("SELECT COUNT(*) AS n FROM subscribers")[0].n === 1, 'subscribers table untouched by the injection attempts');

check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await browser.close();
console.log(failureCount() ? `\n${failureCount()} FAILURE(S)` : '\nALL PASSED');
process.exit(failureCount() ? 1 : 0);
