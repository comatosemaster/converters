# Future Tools

Candidate tools for NeatSize, ranked. The site has 35 tools today; this lists
~130 more that don't overlap with them.

**Shipped from this list:** PDF Merge, PDF to Image, Text Diff Checker, Image Filters & Adjustments, Hash Generator, UUID Generator, Unix Timestamp Converter, Case Converter, QR Code Scanner (2026-10-21) - marked ✅ below.
(Image Cropper was removed: the existing Image Resizer & Cropper already crops.)

Focus order: **Graphics & Media → Text & Data → Developer** first, Business &
Finance next, Everyday and Fun last.

## How to read this

**Priority**
- **P1**: build soon. High search demand, fits "100% in your browser", and/or reuses code we already have.
- **P2**: solid value, build after P1s in the same category.
- **P3**: nice to have, niche, or expensive for its payoff.

**Effort**
- **S**: under a day, no new dependency or a tiny one.
- **M**: a library or real UI work.
- **L**: heavy dependency (WASM/ML model), hard algorithm, or lots of UI.

**Constraints that shaped the ranking**
- Everything must run client-side (privacy is the site's pitch). Tools that need a model download or a big WASM bundle are marked, because they cost first-load time even with lazy loading.
- Network is OK only for data the browser can't have (like Currency Converter's rates). Those tools are flagged 🌐.
- "Reuse" notes point to existing code, so the tool is cheaper than it looks.

---

## Build next: top 25 across all categories

| # | Tool | Category | Effort | Why now |
|---|------|----------|--------|---------|
| 1 | ✅ Image Filters & Adjustments | Graphics | M | Brightness/contrast/saturation - a common edit the site can't do yet |
| 2 | ✅ PDF Merge | Text & Data | M | One of the most searched file tools; `pdf-lib`, fully client-side |
| 3 | ✅ PDF to Image (JPG/PNG) | Text & Data | M | Very high demand; `pdf.js` |
| 4 | ✅ Text Diff / Compare | Text & Data | M | Evergreen, used daily by devs and writers |
| 5 | ✅ Hash Generator (MD5/SHA-1/SHA-256/SHA-512) | Developer | S | Web Crypto API, plus a tiny MD5 |
| 6 | ✅ UUID Generator | Developer | S | `crypto.randomUUID()`, trivial and popular |
| 7 | ✅ Unix Timestamp Converter | Developer | S | Daily dev need; reuse time-zone code from World Clock |
| 8 | ✅ Case Converter | Text & Data | S | Massive search volume, near-zero effort |
| 9 | ✅ QR Code Scanner (from image/camera) | Graphics | S | Pairs with QR Generator; `jsQR` |
| 10 | Image Rotator | Graphics | S | Reuse Image Flipper's canvas pipeline |
| 11 | EXIF Viewer & Remover | Graphics | M | Privacy angle fits the brand perfectly |
| 12 | Add Watermark to Image | Graphics | S | Complements Watermark Remover |
| 13 | CSV ↔ JSON Converter | Text & Data | S | Constant dev and data-analyst need |
| 14 | YAML ↔ JSON Converter | Developer | S | `js-yaml`; reuse JSON formatter UI |
| 15 | Markdown Editor & Preview | Text & Data | S | `marked` + `prismjs` are already dependencies |
| 16 | Box Shadow Generator | Developer | S | Same family as CSS Gradient Generator |
| 17 | Color Contrast Checker (WCAG) | Graphics | S | Reuse `colorConversions.js` |
| 18 | Palette Extractor from Image | Graphics | S | Reuse Image Color Picker |
| 19 | SVG to PNG Converter | Graphics | S | Canvas-only; very common search |
| 20 | Lorem Ipsum Generator | Text & Data | S | Evergreen designer/dev tool |
| 21 | Number Base Converter | Developer | S | Bin/oct/dec/hex; trivial |
| 22 | Blur / Pixelate Image Areas (redact) | Graphics | M | Reuse Watermark Remover's brush and mask |
| 23 | Background Remover | Graphics | L | Top-demand image tool; needs an in-browser ML model (see notes) |
| 24 | PDF Split / Extract Pages | Text & Data | M | Same `pdf-lib` as Merge; build them together |
| 25 | Meta Tag & Open Graph Generator + Preview | Developer | S | SEO audience; reuse `src/seo/` knowledge |

---

## Graphics & Media (36)

| Tool | Priority | Effort | Notes |
|------|----------|--------|-------|
| Background Remover | P1 | L | Needs an ONNX/WebGPU segmentation model (tens of MB). Cache it, and show the download size up front |
| Image Rotator | P1 | S | 90° steps plus a free angle; reuse Image Flipper |
| ✅ QR Code Scanner | P1 | S | Shipped: image/paste/camera, multi-size retry, WiFi/vCard/link parsing |
| Barcode Generator | P1 | S | EAN-13, UPC, Code 128; `JsBarcode` |
| SVG to PNG / JPG | P1 | S | Pick the output size; canvas |
| Add Watermark to Image | P1 | S | Text/logo, opacity, tiling, position |
| EXIF Viewer & Remover | P1 | M | Show GPS/camera data, strip it on download |
| ✅ Image Filters & Adjustments | P1 | M | Shipped: 8 sliders, 10 presets, before/after, full-resolution export |
| Blur / Pixelate Areas | P1 | M | Redact faces, plates, text; reuse the watermark brush |
| Color Contrast Checker (WCAG) | P1 | S | AA/AAA verdicts and suggested fixes; reuse color utilities |
| Palette Extractor from Image | P1 | S | Dominant colors (k-means); reuse Image Color Picker |
| Format landing pages (PNG→JPG, WebP→PNG, JPG→WebP, AVIF→JPG…) | P1 | S | Registry entries presetting Image Converter; cheap SEO wins |
| Color Palette Generator | P2 | S | Harmonies (complementary, triadic…), lock and shuffle |
| SVG Optimizer | P2 | M | Browser build of `svgo`; before/after size |
| Image to SVG (Vectorizer) | P2 | M | `imagetracerjs`; logos and icons |
| App Icon Generator (iOS/Android) | P2 | S | Extend Favicon Generator with platform size sets plus ZIP (`jszip` already present) |
| Social Media Image Resizer | P2 | S | Presets for Instagram/X/LinkedIn/YouTube; reuse Image Resizer |
| Image Grid Splitter | P2 | S | Split into 3×1, 3×3 tiles for Instagram grids |
| Profile Picture Maker | P2 | S | Circle crop, border, background color |
| Screenshot Beautifier | P2 | M | Gradient background, padding, shadow, browser frame |
| Photo Collage Maker | P2 | M | Grid layouts, spacing, export |
| Meme Generator | P2 | M | Top/bottom text with outline; templates from user uploads |
| GIF Maker (from images) | P2 | M | `gifenc` or `gif.js`; frame delay and order |
| Image Upscaler | P2 | L | High-quality resampling now; an ML upscaler later (model size) |
| Placeholder Image Generator | P2 | S | Size, colors, text → PNG/SVG; also useful to devs |
| Image Compare Slider | P3 | S | Reuse the Watermark Remover compare component |
| Color Blindness Simulator | P3 | M | Protanopia/deuteranopia/tritanopia matrices |
| Video to GIF | P3 | L | `ffmpeg.wasm` (~25 MB); heavy but popular |
| Video Compressor | P3 | L | `ffmpeg.wasm`; slow on phones |
| Video Trimmer / Converter | P3 | L | `ffmpeg.wasm` |
| Audio Converter / Trimmer | P3 | L | Web Audio API for WAV; `ffmpeg.wasm` for MP3/AAC |
| GIF Frame Extractor | P3 | M | Decode frames to a PNG ZIP |
| Emoji / Text Favicon Maker | P3 | S | Extend Favicon Generator |
| Image to ASCII Art | P3 | S | Could live in Fun |
| Sprite Sheet Generator | P3 | M | Pack images plus CSS/JSON map |
| Image Noise Remover / Sharpen | P3 | M | Reuse the denoise from `ocrPipeline.js` |

## Text & Data (36)

| Tool | Priority | Effort | Notes |
|------|----------|--------|-------|
| ✅ PDF Merge | P1 | M | Shipped: `pdf-lib`, reorder, per-file page ranges |
| PDF Split / Extract Pages | P1 | M | Same library as Merge |
| ✅ PDF to Image | P1 | M | Shipped: `pdf.js`, PNG/JPG/WebP, 72-300 DPI, ZIP, password-protected PDFs |
| PDF to Text | P1 | M | `pdf.js` text layer; fall back to `ocrPipeline.js` for scanned PDFs |
| ✅ Text Diff / Compare | P1 | M | Shipped as Text Diff Checker: lines/words/chars, side-by-side and inline, patch export |
| ✅ Case Converter | P1 | S | Shipped: 14 cases incl. headline Title Case and code cases; Georgian-aware |
| CSV ↔ JSON Converter | P1 | S | Delimiter detection, header row option |
| Markdown Editor & Preview | P1 | S | `marked` + `prismjs` already installed |
| Lorem Ipsum Generator | P1 | S | Words, sentences, or paragraphs; HTML option |
| Line Tools (sort, dedupe, reverse, shuffle, trim) | P1 | S | One tool, many modes |
| CSV Viewer & Editor | P2 | M | Sortable table, edit cells, export CSV |
| Excel (XLSX) ↔ CSV / JSON | P2 | M | `SheetJS`; lazy-load it |
| Rotate / Reorder / Delete PDF Pages | P2 | M | `pdf-lib`; thumbnail grid |
| PDF Compressor | P2 | L | Honest client-side option is re-rasterizing images; set expectations |
| Sign PDF / Fill PDF | P2 | L | Draw or type signature; `pdf-lib` |
| Word (DOCX) to Text / HTML | P2 | M | `mammoth.js` |
| HTML to Markdown | P2 | S | `turndown` |
| Markdown Table Generator | P2 | S | Grid editor → Markdown/HTML table |
| Find & Replace (with regex) | P2 | S | Reuse the Regex Tester engine |
| Remove Line Breaks & Extra Spaces | P2 | S | Fixes text copied from PDFs |
| Text to Speech | P2 | S | Web Speech API; voices vary by browser |
| Fancy Text / Unicode Font Generator | P2 | S | Social-bio fonts; big search demand |
| Slug Generator | P2 | S | Transliteration (including Georgian/Cyrillic) |
| Number to Words | P2 | S | Including check-writing format |
| Binary / Hex / ASCII Text Converter | P2 | S | Text ↔ code points |
| JSON to CSV / Excel (nested flatten) | P2 | M | Flatten nested keys; complements CSV ↔ JSON |
| Text Encryption (AES) | P3 | M | Web Crypto with a passphrase; clear warnings |
| Speech to Text | P3 | M | Web Speech API support is uneven (Chrome only) |
| Morse Code Translator | P3 | S | With audio playback |
| Roman Numeral Converter | P3 | S | |
| Invisible Character Detector | P3 | S | Zero-width chars, non-breaking spaces |
| Text Repeater | P3 | S | Low effort, steady searches |
| Word / Character Limit Checker (X, meta tags, SMS) | P3 | S | Could extend Word Counter |
| Reading Time Estimator | P3 | S | Already partly in Word Counter; landing page only |
| Bionic / Speed Reading Formatter | P3 | S | |
| Accent / Diacritic Remover | P3 | S | |

## Developer (36)

| Tool | Priority | Effort | Notes |
|------|----------|--------|-------|
| ✅ Hash Generator | P1 | S | Shipped: MD5 + SHA family, text and files, HMAC, checksum verify |
| ✅ UUID Generator | P1 | S | Shipped: v4/v7, bulk up to 1,000, 4 formats, UUID inspector |
| ✅ Unix Timestamp Converter | P1 | S | Shipped: s/ms/µs/ns auto-detect, any zone, ISO/RFC formats, live clock |
| YAML ↔ JSON | P1 | S | `js-yaml`; reuse the JSON formatter UI |
| XML Formatter / Validator + XML ↔ JSON | P1 | M | `DOMParser`; reuse the JSON tree view |
| HTML Formatter & Minifier | P1 | M | Prettier standalone (lazy) or a light beautifier |
| CSS Formatter & Minifier | P1 | S | |
| JavaScript Formatter & Minifier | P1 | M | Prettier standalone / `terser`; both heavy, so lazy-load |
| HTML Entity Encoder / Decoder | P1 | S | Same shape as URL Encoder |
| Number Base Converter | P1 | S | Bin/oct/dec/hex, bit view |
| JSON to TypeScript / Zod / Go types | P1 | M | Huge dev demand; custom generator |
| Cron Expression Builder & Explainer | P1 | M | `cronstrue` plus next-run preview |
| Box Shadow Generator | P1 | S | CSS generator family |
| Meta Tag & Open Graph Generator + Preview | P1 | S | Google/X/Facebook preview cards |
| JSON Diff | P2 | M | Structural diff; reuse JSON tree view |
| JSON Schema Validator / Generator | P2 | M | `ajv` |
| JSONPath / jq Playground | P2 | M | `jsonpath-plus`; jq via WASM is heavier |
| curl to Fetch / Axios / Python Converter | P2 | M | Parse curl flags |
| Code to Image (Carbon-style) | P2 | M | Reuse Prism and the screenshot pipeline |
| HTML / SVG to JSX | P2 | M | Attribute renames and style objects |
| String Escape / Unescape (JSON, JS, CSV, SQL) | P2 | S | |
| URL Parser & Query String Builder | P2 | S | Extend URL Encoder |
| JWT Encoder / Signer | P2 | M | Extend JWT Decoder; HS256 via Web Crypto |
| Bcrypt Generator & Checker | P2 | S | `bcryptjs` |
| IP Subnet / CIDR Calculator | P2 | S | IPv4 first, IPv6 later |
| Chmod Calculator | P2 | S | |
| Border Radius / Clip-path / Glassmorphism Generators | P2 | S | One tool each or a bundle |
| robots.txt Generator | P2 | S | |
| Mock Data / Fake JSON Generator | P2 | M | Schema → rows; avoid heavy `faker` |
| HTTP Status Code Reference | P2 | S | Content-heavy, good SEO |
| User-Agent Parser | P2 | S | Prefilled with the visitor's own UA |
| Flexbox / Grid Playground | P3 | M | Visual, copy CSS |
| Keyboard Event / Keycode Viewer | P3 | S | |
| GraphQL Formatter | P3 | S | `graphql` package's printer |
| Semver Range Checker | P3 | S | |
| .env ↔ JSON Converter | P3 | S | |

## Business & Finance (14)

| Tool | Priority | Effort | Notes |
|------|----------|--------|-------|
| Percentage Calculator | P1 | S | Enormous search volume (X% of Y, % change) |
| Loan / EMI Calculator | P1 | S | Amortization table |
| Mortgage Calculator | P1 | M | Taxes, insurance, extra payments |
| Invoice Generator | P1 | M | PDF via `jspdf` (already a dependency); saved locally |
| Compound Interest Calculator | P2 | S | Complements Savings Calculator |
| VAT / Sales Tax Calculator | P2 | S | Add/remove tax; country presets |
| Discount Calculator | P2 | S | |
| Profit Margin & Markup Calculator | P2 | S | |
| Salary ↔ Hourly Converter | P2 | S | |
| ROI Calculator | P2 | S | |
| Break-even Calculator | P3 | S | |
| Inflation Calculator | P3 | M | 🌐 needs CPI data, or ship a static table |
| Credit Card Payoff Calculator | P3 | S | |
| Retirement Calculator | P3 | M | |

## Everyday (8, deprioritized)

| Tool | Priority | Effort | Notes |
|------|----------|--------|-------|
| Date Difference / Days Between Dates | P2 | S | High demand; pair with Age Calculator |
| Countdown Timer & Stopwatch | P2 | S | |
| Time Duration Calculator | P3 | S | Add/subtract hours and minutes |
| Pomodoro Timer | P3 | S | |
| GPA Calculator | P3 | S | |
| BMR / Calorie Calculator | P3 | S | Pairs with BMI |
| Due Date Calculator | P3 | S | |
| Shoe / Clothing Size Converter | P3 | S | Could extend Unit Converter |

## Fun (6, deprioritized)

| Tool | Priority | Effort | Notes |
|------|----------|--------|-------|
| Spin the Wheel (Decision Wheel) | P2 | M | Big search demand despite being "fun" |
| Random Name Picker / Team Generator | P2 | S | Classrooms and meetings |
| Typing Speed Test | P3 | M | |
| Random Color Generator | P3 | S | Reuse color utilities |
| Yes / No Picker | P3 | S | |
| Emoji Picker & Copier | P3 | S | |

---

## Notes for building these

- **Total:** 25 top picks (all repeated in their categories) and 136 tools across categories, 9 already shipped.
- **Cheap SEO wins:** format-pair landing pages (Image Converter presets) and reference pages (HTTP status codes) cost little and match exact-phrase searches.
- **Shared foundations worth building once:**
  - `pdf-lib` + `pdf.js` unlock about 8 PDF tools - now installed, with a shared loader in `src/utils/pdfjs.js` and page-range parsing in `pdfMergeUtils.js`.
  - A shared "brush/mask" component (from Watermark Remover) unlocks Blur/Redact and a future object remover.
  - The CSS-generator layout (from CSS Gradient Generator) unlocks about 5 generators.
- **Heavy dependencies** (Background Remover's model, `ffmpeg.wasm`, Prettier, SheetJS) must stay lazy-loaded per tool, as all tools are today, and should show the download size before starting.
- Every new tool still needs only a component plus one registry entry. SEO metadata, routing, sitemap and prerendering come for free.
