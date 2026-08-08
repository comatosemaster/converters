# Technical SEO Audit — Rootconverter

**Date:** 2026-08-08 · **Status:** Phase 1 (audit only, nothing changed)
**Method:** static inspection of the codebase + a live crawl of 15 representative
routes capturing rendered `<title>`, meta, canonical, JSON-LD, H1 counts, and
link counts.

Everything below is **verified against the running site**. Where something could
not be verified locally, it says so explicitly.

---

## 0. Two corrections to the brief

Neither changes the work, but both affect what's accurate:

1. **The project is React, not vanilla JS.** It uses `react-router-dom`,
   hooks, and ~50 `.jsx` components. The SEO architecture below is built on
   that reality (no framework migration, as instructed).
2. **There is no "Security" category.** The six real categories are
   `graphics-media`, `text-data`, `business-finance`, `developer`, `everyday`,
   `fun`. Security tools (JWT Decoder, Password Generator) live under
   `developer` and `everyday`.

---

## 1. What is already correct

Worth stating, because it means the foundation is sound and the fixes are
additive rather than structural.

| Area | Finding |
| --- | --- |
| **Crawlable links** | Real `<a href>` throughout — 78 internal links on the homepage, ~32 on tool pages. Navigation does **not** depend on click handlers. |
| **Heading structure** | Exactly **one `<h1>` on every one of the 15 routes crawled**. No heading-for-styling abuse found. |
| **Routing** | History API (`createBrowserRouter`), no hash routes. URLs are clean and lowercase. |
| **Landmarks** | `<main id="main">`, `<header>`, `<footer>`, `<nav aria-label=…>`, and a working skip link. |
| **Search** | Client-side only; produces **no crawlable URLs**. No risk of thousands of duplicate query-string pages. |
| **Heavy dependencies** | `heic2any` and `tesseract.js` are correctly `await import()`-ed on demand, not in the initial bundle. |
| **Blog** | Already has canonical, Open Graph, Twitter Card, and `Article` + `BreadcrumbList` JSON-LD. |
| **Console** | Zero page errors across all 15 routes. |

---

## 2. Findings, ranked

### 🔴 CRITICAL

#### C1. No canonical URL on any non-blog page
**Verified:** homepage, all category pages, and all tool pages render **zero**
`<link rel="canonical">`. Only the three blog routes have one.

**Why it matters:** the site is reachable at both `rootconverter.com` and its
`*.workers.dev` origin. Without a canonical, both can be indexed as separate
sites, splitting ranking signals across duplicates of all 28 tool pages. This is
the single highest-value fix.

---

#### C2. Soft 404s — invalid URLs return HTTP 200 and look like real pages
**Verified:**

| URL | HTTP | `<title>` | robots |
| --- | --- | --- | --- |
| `/tool/does-not-exist` | **200** | `Rootconverter` | none |
| `/totally-bogus-url` | **200** | `Rootconverter` | none |
| `/blog/does-not-exist` | **200** | `Not found \| Rootconverter` | none |

`NotFound.jsx` never calls `useDocumentMeta`, so a 404 inherits the default
title and emits **no `noindex`**.

**Why it matters:** Cloudflare's `single-page-application` mode serves
`index.html` with 200 for every unmatched path. Any mistyped or stale inbound
link becomes an indexable page with duplicate boilerplate. At scale this dilutes
crawl budget and can be treated as low-quality content sitewide.

---

#### C3. No `sitemap.xml`
**Verified:** `public/` contains only `favicon.svg` and `tesseract/`.

**Why it matters:** 28 tools + 6 categories + blog pages currently rely entirely
on link discovery. A sitemap is how new tools get found quickly, and it's the
prerequisite for meaningful Search Console coverage data.

---

#### C4. No `robots.txt`
**Verified:** absent.

**Why it matters:** no sitemap reference, and no explicit allow signal. Low
effort, and it's the file crawlers request first.

---

### 🟠 HIGH

#### H1. SEO metadata is hardcoded in 28 separate component files
**Verified:** all 28 tools call `useDocumentMeta`, but each one passes literal
strings from inside its own `.jsx`. The registry has **zero** SEO fields —
`readRegistry()` reports tool keys as only: `id, name, description, category,
keywords, popular`. Zero tools define `seoTitle` or `metaDescription`.

**Why it matters:** this is precisely the maintenance problem the brief calls
out. Adding tool #29 means remembering to hand-write metadata in a component.
There is no single place to audit titles for uniqueness or length, and no way to
generate a sitemap from truth.

---

#### H2. `index.html` ships almost no metadata
**Verified:** the static HTML contains only `<title>Rootconverter</title>`. No
meta description, no canonical, no Open Graph, no Twitter Card.

**Why it matters:** every title and description is applied by JavaScript *after*
React mounts. Googlebot renders JS and will generally see the final values, but
**social scrapers and link previewers largely do not execute JavaScript** —
Slack, Discord, WhatsApp, iMessage, and LinkedIn will all show a bare
"Rootconverter" for every link on the site. This is an SPA-inherent limitation
(see §4) with a good partial mitigation.

---

#### H3. No `og:image` anywhere
**Verified:** `og:image` is null on all 15 routes; no image asset exists in
`public/` besides `favicon.svg`.

**Why it matters:** every shared link renders as a blank/text-only card, which
measurably suppresses click-through from social and chat. Also affects how the
brand appears when others link to the tools.

---

#### H4. Duplicate meta description across two different pages
**Verified:** `/category/developer` and `/blog/category/developer` both emit
`"Format, validate, and analyze the things you work with daily."` — both reuse
`category.tagline`.

**Why it matters:** two distinct indexable URLs with identical descriptions is a
direct duplicate-content signal, and it will repeat for **all six categories**
as the blog grows.

---

#### H5. Structured data exists only on blog articles
**Verified:** JSON-LD present on `/blog/<slug>` (`Article`, `BreadcrumbList`)
and nowhere else. No `WebSite`, `Organization`, `WebApplication`,
`CollectionPage`, or `SearchAction`.

**Why it matters:** tool pages are the site's commercial core and currently
communicate nothing machine-readable about what they are. `WebApplication` with
`applicationCategory` and `offers: price 0` is genuinely accurate here — these
are free browser applications — and is the correct schema, not decoration.

---

#### H6. No route-level code splitting — 1.46 MB main bundle
**Verified from the real build:**

```
1460 KB  index-*.js      ← every one of the 28 tools
1324 KB  heic2any-*.js   ← correctly lazy
 196 KB  html2canvas-*.js
 148 KB  index.es-*.js
```

`registry.js` statically imports all 28 tool components (verified: 28 static
imports), and there is **no `React.lazy` anywhere in `src/`**.

**Why it matters:** someone opening the Coin Flip downloads the SQL formatter,
jsPDF, and QR generator too. Core Web Vitals (LCP/INP) are ranking inputs, and
this is the largest single lever. ~440 KB gzipped is survivable but will get
worse linearly as tools are added — directly at odds with the "scale to 500
tools" goal.

> **Not verified:** actual Lighthouse/PageSpeed/CrUX numbers. I have not run
> them and will not invent them. The bundle sizes above are real build output.

---

### 🟡 MEDIUM

#### M1. Inconsistent, sometimes awkward title templates
**Verified samples:**
- `JSON Formatter, Validator & Fixer - Free & Client-Side | Rootconverter` (70 chars — will truncate)
- `Image Flipper - Flip Images Horizontally or Vertically | Rootconverter` (69 chars)
- `Developer Tools | Rootconverter` (31 chars)

**Why it matters:** Google truncates around 55–60 characters. "Free &
Client-Side" burns budget on nearly every tool page without adding search value.

#### M2. No breadcrumb structured data on tool or category pages
Visible breadcrumbs exist (`Breadcrumbs.jsx` renders a real `<nav>`), but only
blog articles emit `BreadcrumbList`. Free win — the visible content already
matches, so the markup would be honest.

#### M3. Icon and manifest coverage is thin
Only `favicon.svg`. No `apple-touch-icon`, no PNG fallback, no web manifest.
Affects mobile bookmarks and PWA-ish surfaces, not ranking directly.

#### M4. Category pages are thin
A category page is a heading, a one-line tagline, and a grid. There's no
explanatory content, which limits their ability to rank for
"<category> tools" queries.

#### M5. No `lastmod` source for the sitemap
Tools carry no date metadata, so sitemap entries can't express freshness.
Articles do have `publishDate`/`updatedDate`.

---

### 🔵 LOW

#### L1. `/tool/` vs the brief's preferred `/tools/`
Current URLs are `/tool/<id>` and `/category/<id>`. The brief prefers
`/tools/<slug>`.

**Recommendation: do not change this.** The URLs are already clean, semantic,
and indexed. Renaming buys no ranking benefit, and on a static Cloudflare SPA
proper 301s require additional redirect configuration. The cost/benefit is
clearly negative. (If you disagree, it's doable — say so and I'll plan it
properly with redirects.)

#### L2. Trailing-slash behaviour unverified in production
`/tool/base64-encoder-decoder/` vs no slash could both resolve. Self-referencing
canonicals (C1) neutralise this regardless.

#### L3. `keywords` array is used only for internal search
That's correct usage — the `<meta name="keywords">` tag is ignored by Google and
should **not** be added.

---

## 3. Proposed architecture (Phase 2 outline)

Registry-driven, so a new tool or article inherits everything automatically.

```
src/seo/
  siteConfig.js      Domain, brand, defaults, social image
  buildMeta.js       Page-type → title/description/canonical/OG/Twitter
  structuredData.js  JSON-LD builders (WebSite, WebApplication, …)
  routes.js          Enumerates every indexable URL — one source of truth
scripts/
  generate-sitemap.js  Build-time; writes public/sitemap.xml from routes.js
public/
  robots.txt
  og-default.png
```

**Metadata resolution order** (per page type):

```
explicit seoTitle in registry/frontmatter
  → generated from name + category
    → site default
```

So tool #29 needs **no SEO code** — a registry entry is enough — but any tool
*can* override its title/description when the generated one reads awkwardly.

**Sitemap** is generated at build time from `routes.js`, which reads the
registry and the blog corpus. It cannot drift, because it's derived from the
same data the site renders from.

**404** gets `<meta name="robots" content="noindex">` plus a proper title. A
true HTTP 404 is impossible for client-side routes under
`not_found_handling: single-page-application` — I'll document that limitation
honestly rather than pretend otherwise, and `noindex` is the correct available
remedy.

---

## 4. The SPA limitation, stated honestly

Metadata is applied by JavaScript after mount. Consequences:

- **Googlebot:** renders JS; will see correct titles, descriptions, canonicals,
  and JSON-LD. Fine.
- **Social scrapers** (Slack, Discord, WhatsApp, LinkedIn, iMessage): mostly do
  **not** execute JS. They will see whatever is in the static `index.html`.

**Mitigation without SSR:** put strong site-wide defaults (description, OG,
Twitter, `og:image`) directly in `index.html`. Every share then renders a
correct Rootconverter card, even if not page-specific.

**Full fix** would require prerendering or SSR. The brief says not to introduce
SSR without compelling reason, and I agree here — a build-time prerender step
could be added later if social CTR proves to matter. I am not proposing it now.

---

## 5. What I have NOT verified

- Lighthouse / PageSpeed / Core Web Vitals scores (not run — will not invent).
- Google Search Console state (no access).
- Live production behaviour of `rootconverter.com` — including whether the
  domain is actually attached, and real HTTP status codes for unknown paths.
  Local dev and Cloudflare may differ.
- Whether the `*.workers.dev` origin is publicly reachable (this determines how
  urgent C1 is — if it is, duplication is already happening).
- Real-world crawler behaviour; all conclusions are from configuration.

---

## 6. Suggested implementation order

1. **C4, C3** — `robots.txt` + generated `sitemap.xml` (fast, high value)
2. **C1** — canonical URLs everywhere
3. **C2** — `noindex` + real title on 404
4. **H1** — move SEO metadata into the registry
5. **H2, H3** — static defaults in `index.html` + an OG image
6. **H4, H5, M2** — fix duplicate descriptions, add structured data
7. **H6** — route-level code splitting (biggest change; separate step)
