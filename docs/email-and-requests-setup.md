# Email updates + "Request a Tool" - setup and operations

Everything for the email subscription, the "Request a Tool" form and the
weekly digest is built and tested locally, on the branch
`feature/email-subscriptions` (3 commits, one per phase). **Nothing is
deployed, and nothing was created on the Cloudflare or Resend accounts** -
those steps need you (logins, API keys, DNS). This file lists them in order.

> Until steps 1-5 below are done, the branch is still safe to merge: with no
> Turnstile site key, every form is hidden (the request page shows an email
> address instead), and the API answers "not available yet".

---

## Go-live checklist (do these in order)

### 1. Resend - account, domain, DNS (about 15 minutes + DNS wait)

1. Sign up at <https://resend.com> (free plan: 100 emails/day, 3,000/month).
2. **Domains -> Add Domain -> `neatsize.com`**. Pick the region nearest your
   readers (e.g. `eu-west-1` / Ireland); it only changes the MX value below.
3. Resend shows the exact records. Either click **"Sign in to Cloudflare"**
   on that page (it adds them automatically), or add them by hand in
   **Cloudflare dashboard -> neatsize.com -> DNS -> Records -> Add record**:

   | Type | Name (as typed in Cloudflare) | Content | Priority | Proxy |
   |------|-------------------------------|---------|----------|-------|
   | MX   | `send`              | `feedback-smtp.<region>.amazonses.com` - **copy from Resend** | `10` | DNS only |
   | TXT  | `send`              | `v=spf1 include:amazonses.com ~all` - copy from Resend | - | DNS only |
   | TXT  | `resend._domainkey` | `p=MIGfMA0GCSq...` - **your own DKIM key, copy from Resend** | - | DNS only |
   | TXT  | `_dmarc`            | `v=DMARC1; p=none; rua=mailto:hello@neatsize.com;` | - | DNS only |

   - Type only `send`, not `send.neatsize.com` - Cloudflare adds the domain.
   - TXT/MX records can't be proxied anyway; if Cloudflare shows an orange
     cloud on anything, set it to grey (DNS only).
   - SPF lives on the `send.` subdomain, so it doesn't touch any SPF record
     you might add at the root later. If a `_dmarc` record already exists,
     edit it instead of adding a second one.
   - DMARC: start with `p=none` (Resend's recommendation), check reports for
     a few weeks, then move to `p=quarantine`.
4. Back in Resend press **Verify**. It usually turns green within minutes
   (can take up to a few hours).
5. **API Keys -> Create API Key** - permission **Sending access**, domain
   **neatsize.com**. Copy it (starts with `re_`) - it's shown only once.

### 2. A contact mailbox: hello@neatsize.com (5 minutes)

The privacy page, the unsubscribe page and every email's Reply-To use
`hello@neatsize.com`. Make it real with **Cloudflare dashboard ->
neatsize.com -> Email -> Email Routing -> Get started**: create the address
`hello@neatsize.com` -> forward to your own inbox, and let Cloudflare add its
MX/TXT records. (These are on the root domain; Resend's are on `send.` -
they don't clash.)
Want a different address? Change `CONTACT_EMAIL` in
`src/config/publicConfig.js` and `EMAIL_REPLY_TO` in `wrangler.jsonc`.

### 3. Turnstile (bot protection) - site key + secret (3 minutes)

**Cloudflare dashboard -> Turnstile -> Add widget**:
- Name: `NeatSize forms`; hostname: `neatsize.com`; mode: **Managed**.
- Copy the **Site Key** (public) and the **Secret Key** (private).

Put the **site key** into `src/config/publicConfig.js`:

```js
const TURNSTILE_SITE_KEY_PRODUCTION = '0x4AAAAAAA...';   // your site key
```

(Or set `VITE_TURNSTILE_SITE_KEY` under the Worker's **Settings -> Build ->
Variables** instead - that wins over the file.) This is what makes the forms
appear on the site.

### 4. D1 database (2 minutes)

```bash
npx wrangler d1 create neatsize-db
```

It prints a `database_id`. Paste it into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "neatsize-db",
    "database_id": "<paste here>",
    "migrations_dir": "migrations"
  }
],
```

Then create the tables on the real database:

```bash
npx wrangler d1 migrations apply neatsize-db --remote
```

(Two migrations: `0001_subscribers.sql`, `0002_tool_requests.sql`. Later
schema changes = new numbered files + the same command.)

### 5. Secrets (2 minutes)

Each command asks for the value (paste it; it's never shown or stored in git):

```bash
npx wrangler secret put RESEND_API_KEY          # the re_... key from step 1
npx wrangler secret put TURNSTILE_SECRET_KEY    # the secret from step 3
npx wrangler secret put IP_HASH_SALT            # any long random string, e.g. the output of:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep `IP_HASH_SALT` stable - changing it only resets the rate limits.
Check with `npx wrangler secret list`.

### 6. Merge and deploy

```bash
git checkout master
git merge feature/email-subscriptions
git push
```

Cloudflare Workers Builds deploys as usual (`npm run build` +
`wrangler deploy`). Confirm a **"Workers Builds: converters"** check run
appears on the commit within ~3 minutes; if not, deploy by hand:
`npm run build && npx wrangler deploy`.

What changes on deploy: the Worker now has a script (`worker/index.js`),
but **only `/api/*` runs it** - every page and file is still served as a
static asset with no code running. A daily cron (05:00 UTC) is registered.

### 7. Check it on the live site (10 minutes)

1. Open any page, scroll to the footer, subscribe with your own address ->
   confirmation email arrives from `updates@neatsize.com` -> click it ->
   lands on `/subscribed`.
2. In Gmail, open the email -> "Show original": **SPF, DKIM and DMARC = PASS**.
3. Submit a test request at `/request-tool`, then `npm run requests` - it
   should be listed. Clean up with `npm run request:status -- <id> rejected`.
4. `npm run digest:preview` - shows what next Monday's email will contain.
5. `npm run digest:test -- you@yourmail.com` (needs `RESEND_API_KEY=re_...`
   in a local `.env` file, which is gitignored) - sends that digest to you
   only.
6. Check `https://neatsize.com/feed.json` and `/rss.xml` load.

The first real digest goes out on the first Monday after deploy at 09:00
Tbilisi time, covering tools/guides from the previous 7 days.

---

## Day-to-day operations

| Task | Command |
|------|---------|
| See new + planned tool requests | `npm run requests` (add `-- --all` for every request) |
| Mark a request planned / rejected | `npm run request:status -- <id> planned` |
| Mark a request shipped | `npm run request:ship -- <id> <tool-slug>` (slug must exist in the registry, e.g. `pdf-split`) - the requester's next digest leads with "The tool you requested is live" |
| Preview next Monday's digest | `npm run digest:preview` (writes `.digest-preview/next-digest.html`) |
| Send the next digest to yourself only | `npm run digest:test -- you@example.com` (`-- --latest 5` if nothing is new) |
| Pause the digest | set `"DIGEST_ENABLED": "false"` in `wrangler.jsonc` and deploy (housekeeping still runs) |
| Raise the daily send cap (paid Resend plan) | `"MAX_SENDS_PER_RUN"` in `wrangler.jsonc` |
| Live logs | `npx wrangler tail`, or dashboard -> Worker -> Observability |
| Count subscribers | `npx wrangler d1 execute neatsize-db --remote --command "SELECT status, COUNT(*) FROM subscribers GROUP BY status"` |
| Delete someone completely (on request) | `npx wrangler d1 execute neatsize-db --remote --command "DELETE FROM digest_sends WHERE subscriber_id = (SELECT id FROM subscribers WHERE email='x@y.z'); UPDATE tool_requests SET subscriber_id = NULL, email = NULL WHERE email='x@y.z' OR subscriber_id = (SELECT id FROM subscribers WHERE email='x@y.z'); DELETE FROM subscribers WHERE email='x@y.z';"` |

All admin commands use the **production** database; add `--local` to use the
local test database instead.

**New tools must get a `publishedAt: 'YYYY-MM-DD'`** in
`src/tools/registry.js` (release day). Articles use their frontmatter
`publishDate`. That date is what puts them in the Monday email.

---

## What was built

### Phase 1 - subscribe / confirm / unsubscribe
- `worker/index.js` - Worker entry; handles only `/api/*` (wrangler.jsonc
  `run_worker_first`) and the cron.
- `POST /api/subscribe` - validates the email, rate-limits 5/hour per
  salted IP hash, verifies Turnstile server-side, upserts a **pending**
  subscriber with fresh tokens, sends the double-opt-in email. **Same
  answer** whether the address is new, pending or already subscribed
  (already-active ones get no email). Unsubscribed people can re-subscribe.
- `GET /api/confirm?token=` -> active -> `/subscribed` (expired/used link ->
  `/subscribed?status=invalid`, which explains itself).
- `GET /api/unsubscribe?token=` shows a one-button page (opening the link
  changes nothing, so mail scanners can't unsubscribe people);
  `POST /api/unsubscribe` unsubscribes -> `/unsubscribed`. RFC 8058
  one-click (`List-Unsubscribe=One-Click`) supported.
- Pending sign-ups not confirmed in 7 days are deleted by the daily cron.
- Frontend: `<SubscribeForm>` in the footer of every page and at the end
  of every blog post; the promise line *"Only your email, only for new
  tools and guides. Unsubscribe in one click."* next to every email field;
  no popups, no auto-focus.
- Turnstile is loaded **only** when a form is near the screen or focused,
  in "interaction-only" mode (invisible unless Cloudflare needs a click).
- Pages: `/subscribed`, `/unsubscribed` (noindex, not in the sitemap),
  `/privacy` (indexed) - what's stored, why, retention, deletion.
- Emails: light HTML + plain text, from `NeatSize <updates@neatsize.com>`.

### Phase 2 - Request a Tool
- `POST /api/request-tool` + the indexed page `/request-tool`: "What should
  the tool do?" (10-1000 chars), "Example or file types" (optional), email
  (optional) + "Email me when it ships" (unchecked by default). Same
  Turnstile + rate limit. Ticking the box creates/links a pending
  subscriber (`source='request'`) whose confirmation email quotes the request.
- Entry points: lightbulb icon in the header, link in the sidebar/mobile
  menu and footer, a "Missing a tool? Request it" card ending the full tool
  list, search results and every category page, a small link under every
  tool, and the homepage "Can't find what you need?" button.
- CLI admin only (no admin UI): `npm run requests`, `request:status`,
  `request:ship` (validate every argument before building SQL).

### Phase 3 - weekly digest
- Build now writes `/feed.json` (JSON Feed 1.1) and `/rss.xml` from the
  route registry; every tool got a real `publishedAt` (its first git
  commit date), articles use `publishDate`.
- Cron (daily 05:00 UTC = 09:00 Tbilisi): delete stale pending sign-ups and
  old rate-limit records; on Mondays create the digest from items newer than
  the previous digest and send it; on other days only finish a digest the
  daily cap cut short. Nothing new -> nothing sent, nothing recorded.
- Resend batch API, <=100 per call, each email individually rendered with
  its own unsubscribe link + `List-Unsubscribe` / `List-Unsubscribe-Post`
  headers, idempotency keys on every call, `digest_sends` so nobody gets a
  digest twice. Requesters whose request shipped get "The tool you requested
  is live: <link>" at the top, once.
- Subject: "New on NeatSize: <first item> + N more"; sections New tools /
  New guides; links tagged `utm_source=newsletter`.

### Files
- New: `worker/` (entry, `lib/`, `routes/`, `tests/`), `migrations/`,
  `scripts/admin/` (requests + digest CLI), `scripts/lib/feeds.js`,
  `src/components/SubscribeForm.jsx`, `RequestToolForm.jsx`,
  `src/hooks/useTurnstile.js`, `src/config/publicConfig.js`,
  `src/seo/staticPages.js`, `src/pages/{Privacy,RequestTool,Subscribed,Unsubscribed}Page.jsx`.
- Changed: `wrangler.jsonc` (Worker script, D1, cron, vars), `package.json`
  (wrangler dev dependency, admin/test scripts), `src/tools/registry.js`
  (`publishedAt`), route registry/prerender/verify (utility pages, feeds),
  `Layout`/`Sidebar`/`ToolGrid`/`ToolLayout`/`Home`/`CategoryPage`/`BlogArticlePage`
  (placements and links), `index.html` (feed links), `index.css`, `.gitignore`.

---

## Decisions I made on my own (worth a glance)

1. **Digest cutoff instead of `sent_at`.** The spec says "items with
   publishedAt > last digest's sent_at", but tools and articles only have a
   *date*: a tool released on a Monday after 09:00 would be dated before
   that day's send time and silently skipped forever. The `digests` table
   stores a `cutoff` (newest item date already announced) and an
   `items_json` snapshot (so a resumed digest sends identical content).
2. **The very first digest looks back 7 days only**, not the whole catalogue.
3. **One daily cron** (`0 5 * * *`) that acts as "weekly" on Mondays and
   "resume only" on other days, rather than two cron entries.
4. **Late confirmers wait a week:** a digest resumed on Tuesday doesn't go
   to someone who confirmed after it was created.
5. **Rate limits live in a small D1 table** (`rate_events`, 24 h retention),
   so they're testable locally and need no extra Cloudflare product.
6. **Email given without ticking the box** is stored with the request (so
   you could reply), but the person is *not* subscribed. The privacy page
   says so.
7. **Header entry point is an icon** (lightbulb, with a tooltip and an
   accessible name) - the header had no room for another text link at
   common laptop widths. Text links are in the sidebar/menu and footer.
8. **Forms stay hidden until a Turnstile site key is configured**, so a
   half-configured deploy can't show a broken form.
9. **`/subscribed` and `/unsubscribed`** are a new "utility" page kind:
   prerendered and hydrated like every page, but noindex, no canonical, and
   verified to be absent from the sitemap.
10. **Contact address `hello@neatsize.com`** (not your personal email) on
    public pages - needs step 2 above.

---

## Testing - what was run (all locally)

- **Unit tests** - `npm run test:worker` - 28 tests, all passing:
  email/request validation, tokens, IP hashing, the full subscriber
  lifecycle and 7-day expiry, foreign-key-safe cleanup, rate limiting,
  digest item selection, feed round-trip, resumable sending with the daily
  cap, 100-per-batch, failure -> partial, kill switch, the requester line.
  They run the real migrations on Node's built-in SQLite as a D1 stand-in.
- **End-to-end** against `wrangler dev` + local D1 + a fake Resend server
  (only `*@resend.dev` test addresses; nothing was ever emailed):
  - `worker/tests/e2e/phase1.e2e.mjs` - 34 checks (lazy Turnstile, footer
    and blog forms, confirm, reused link, no enumeration, unsubscribe page
    + one-click, resubscribe, cross-site/missing-token/invalid/rate-limit,
    Resend outage, cron cleanup).
  - `phase2.e2e.mjs` - 36 checks (requests with/without email, checkbox
    rules, linked subscriber + request-specific confirmation, all entry
    points, CLI admin incl. SQL-injection attempts).
  - `phase3.e2e.mjs` - 27 checks (feeds, Tuesday no-op, Monday send with
    per-person unsubscribe headers, requester line, retry no-op, one-click
    from the digest header, nothing-new skip, `digest:preview` with fake
    feed items, `digest:test`).
- **Site checks**: `npm run build` verification passes (84 indexed pages +
  2 noindex, unique titles/descriptions, canonicals, sitemap); no hydration
  errors on any new page (development build); `wrangler deploy --dry-run`
  valid (Worker 36 KB, 11 KB gzipped).
- **Lighthouse** (mobile, `/tool/pdf-merge`, 3 runs each, master vs this
  branch): performance **92 vs 92**, FCP 2.5 s / LCP 2.8 s both, CLS 0,
  **zero Turnstile requests on load**; page weight +7 KB.

### Running the local tests yourself

```bash
npm run test:worker                                   # unit tests

# end-to-end
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
npx wrangler d1 migrations apply neatsize-db --local
# .dev.vars (gitignored) - test values only:
#   RESEND_API_KEY=re_local_fake_key
#   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA   (Cloudflare's always-pass test secret)
#   IP_HASH_SALT=local-test-salt
#   RESEND_API_URL=http://127.0.0.1:4300
#   SITE_URL=http://localhost:8787
node worker/tests/e2e/fakeResend.mjs                  # terminal 1
npx wrangler dev --port 8787                          # terminal 2
node worker/tests/e2e/phase1.e2e.mjs                  # then phase2, phase3
```

(The e2e scripts need Playwright: `PW=$(npm root -g)/playwright` if it's
installed globally.)

---

## Limits and leftovers

- **Resend free plan: 100 emails/day.** With more than 100 subscribers a
  digest is finished over several days automatically; a paid plan + higher
  `MAX_SENDS_PER_RUN` removes the wait.
- **Gmail/Yahoo bulk rules** (5,000+/day) are already met: SPF + DKIM +
  DMARC, one-click unsubscribe headers, double opt-in.
- Not built (by design or out of scope): an admin UI, open/click tracking,
  per-topic preferences, a web archive of past digests.
- Requests that ship but whose tool has no new feed item that week wait for
  the next digest that does have new items.
