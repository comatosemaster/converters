#!/usr/bin/env node
// -----------------------------------------------------------------------
// Manual controls for the weekly digest. Uses the Worker's own code
// (worker/lib/digest.js), so what you see is exactly what the cron sends.
//
//   npm run digest:preview
//       Renders the next digest to .digest-preview/next-digest.html (+ .txt)
//       and prints the subject, items and how many people would get it.
//       Sends nothing, records nothing.
//
//   npm run digest:test -- you@example.com
//       Sends the next digest to that ONE address (needs RESEND_API_KEY in
//       .env or the environment). Records nothing; subscribers get nothing.
//
// Options:
//   --local            use the local `wrangler dev` database instead of production
//   --feed <file|url>  feed.json to read (default: dist/feed.json, else the live site's)
//   --date YYYY-MM-DD  pretend it's that day (e.g. next Monday)
//   --latest N         digest:test only - if nothing is new, send the N newest items anyway
//
// Kill switch for the automatic digest: set DIGEST_ENABLED to "false" in
// wrangler.jsonc (or the dashboard) and deploy - the cron then skips it.
// -----------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '../lib/registryData.js';
import { args, runSql, where } from './d1.js';
import { parseFeed, renderDigestFor, selectDigestItems } from '../../worker/lib/digest.js';
import { sendEmail } from '../../worker/lib/resend.js';
import { isValidEmail, normalizeEmail } from '../../worker/lib/validation.js';

const SITE_URL = 'https://neatsize.com';

function option(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

async function loadFeed() {
  const source = option('feed') ?? (existsSync(path.join(REPO_ROOT, 'dist', 'feed.json')) ? path.join(REPO_ROOT, 'dist', 'feed.json') : `${SITE_URL}/feed.json`);
  const raw = /^https?:/.test(source) ? await (await fetch(source)).text() : await readFile(source, 'utf8');
  return { source, items: parseFeed(JSON.parse(raw)) };
}

function now() {
  const date = option('date');
  if (!date) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date must look like 2026-11-02');
  return new Date(`${date}T05:00:00Z`);
}

/** What the next cron run would send: { items, resuming, digestId? }. */
async function nextDigest() {
  const { source, items: feed } = await loadFeed();
  const [partial] = runSql("SELECT id, items_json, sent_at FROM digests WHERE status = 'partial' ORDER BY id LIMIT 1");
  if (partial) return { source, items: JSON.parse(partial.items_json), resuming: true, digestId: partial.id };
  const [last] = runSql('SELECT cutoff, sent_at FROM digests ORDER BY id DESC LIMIT 1');
  return { source, items: selectDigestItems(feed, { cutoff: last?.cutoff ?? null, now: now() }), resuming: false, last, feed };
}

async function preview() {
  const next = await nextDigest();
  console.log(`Feed: ${next.source}`);
  console.log(`Database: ${where()}`);
  if (next.items.length === 0) {
    console.log(`\nNothing new since ${next.last ? `the last digest (items up to ${next.last.cutoff})` : 'the last 7 days'} - the cron would skip this week.`);
    return;
  }
  const [counts] = runSql(`
    SELECT (SELECT COUNT(*) FROM subscribers WHERE status = 'active') AS active,
           (SELECT COUNT(*) FROM tool_requests r JOIN subscribers s ON s.id = r.subscriber_id
             WHERE r.status = 'shipped' AND r.notified_at IS NULL AND s.status = 'active') AS shipped
    ${next.resuming ? `, (SELECT COUNT(*) FROM digest_sends WHERE digest_id = ${next.digestId}) AS done` : ''}`);
  const recipients = counts.active - (counts.done ?? 0);

  const email = renderDigestFor({
    items: next.items,
    unsubscribeUrl: `${SITE_URL}/api/unsubscribe?token=PREVIEW`,
    campaign: `digest-${now().toISOString().slice(0, 10)}`,
  });
  const dir = path.join(REPO_ROOT, '.digest-preview');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'next-digest.html'), email.html, 'utf8');
  await writeFile(path.join(dir, 'next-digest.txt'), `Subject: ${email.subject}\n\n${email.text}`, 'utf8');

  console.log(`\n${next.resuming ? `Resuming partial digest #${next.digestId}` : 'Next digest'}: "${email.subject}"`);
  for (const item of next.items) console.log(`  [${item.type === 'tool' ? 'tool ' : 'guide'}] ${item.publishedAt}  ${item.title}`);
  console.log(`\nWould go to ${recipients} active subscriber(s)${counts.shipped ? `; ${counts.shipped} of them also get a "the tool you requested is live" line` : ''}.`);
  console.log(`Daily send limit (MAX_SENDS_PER_RUN) is 100 by default - more than that finishes over the following days.`);
  console.log(`\nPreview written to .digest-preview/next-digest.html (and .txt). Nothing was sent.`);
}

async function sendTest(address) {
  const to = normalizeEmail(address);
  if (!isValidEmail(to)) throw new Error(`"${address ?? ''}" isn't a valid email address.`);
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set - add it to .env (gitignored) or the environment.');

  let { items } = await nextDigest();
  if (items.length === 0) {
    const latest = Number(option('latest'));
    if (!latest) throw new Error('Nothing new, so there is no next digest. Add --latest 5 to send a sample with the 5 newest items.');
    items = selectDigestItems((await loadFeed()).items, { cutoff: '0000-00-00', now: now() }).slice(0, latest);
  }
  const email = renderDigestFor({
    items,
    unsubscribeUrl: `${SITE_URL}/api/unsubscribe?token=TEST-SEND`,
    campaign: 'digest-test',
  });
  const env = { RESEND_API_KEY: process.env.RESEND_API_KEY, RESEND_API_URL: process.env.RESEND_API_URL, EMAIL_FROM: process.env.EMAIL_FROM };
  const result = await sendEmail(env, { to, ...email, subject: `[Test] ${email.subject}` });
  console.log(`Sent "[Test] ${email.subject}" to ${to} (Resend id ${result.id ?? '?'}).`);
  console.log('Its unsubscribe link is a dummy (test sends belong to no subscriber). Nothing was recorded.');
}

const [command] = args;
try {
  if (command === 'preview') await preview();
  else if (command === 'test') await sendTest(args[1]);
  else throw new Error('Usage: npm run digest:preview | npm run digest:test -- you@example.com   [--local] [--feed path] [--date YYYY-MM-DD] [--latest N]');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
