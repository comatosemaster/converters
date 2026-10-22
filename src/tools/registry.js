import { lazyWithPreload } from '../utils/lazyWithPreload.js';

// -----------------------------------------------------------------------
// THE TOOL REGISTRY
// -----------------------------------------------------------------------
// This file is the single source of truth for every tool on the site.
// The homepage, the header navigation, the search/command palette, and the
// /tool/:id route all read from the `tools` array below - nothing else
// needs to change when you add a new tool.
//
// See README.md for the step-by-step "how to add a new tool" recipe.
// -----------------------------------------------------------------------

import {
  Binary,
  Blend,
  Braces,
  CaseSensitive,
  Cake,
  Calculator,
  CalendarClock,
  Clock,
  Code,
  Coins,
  Cpu,
  Contrast,
  Crop,
  Database,
  Dices,
  Diff,
  Disc,
  Eraser,
  FileImage,
  FileKey,
  FileCode,
  FileOutput,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  FlipHorizontal,
  Globe,
  Hash,
  Image,
  ImageDown,
  Images,
  KeyRound,
  Layers,
  MapPinOff,
  Merge,
  NotebookPen,
  Link2,
  Palette,
  PartyPopper,
  PiggyBank,
  Pilcrow,
  Pipette,
  QrCode,
  Receipt,
  Regex,
  RotateCw,
  Ruler,
  Scale,
  ScanQrCode,
  ScanText,
  Shapes,
  Shrink,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
  Stamp,
  SwatchBook,
  Type,
  Wrench,
} from 'lucide-react';

// The fixed categories every tool must belong to. `id` is used in
// URLs and as a React key, `name` is what gets displayed on screen,
// `icon` is a lucide-react component, and `tagline` is the one-line
// summary shown on category pages.
//
// `intro` is the paragraph under the heading on the TOOL category page
// (/category/:id) and `blogIntro` the one on the BLOG category page
// (/blog/category/:id). They are separate on purpose: the two pages are
// both indexable, and sharing one paragraph would make them near-duplicates.
// Without them a small category's page is little more than a list of links,
// and the build's content check (scripts/verify-prerender.js) rejects any
// page with under 100 words of real text.
export const CATEGORIES = [
  {
    id: 'graphics-media',
    name: 'Graphics & Media',
    icon: Image,
    tagline: 'Convert, compress, resize, and generate images - all in your browser.',
    intro:
      'These tools handle the image jobs that come up again and again: switching a photo between PNG, JPG, WebP and AVIF, shrinking a file before you email it, resizing or cropping to exact dimensions, turning an iPhone HEIC photo into a JPG, or building a full favicon set from one picture. There are also color tools for picking a shade out of an image and converting it between HEX, RGB and HSL. Every one of them works on your own device using the browser\'s built-in image engine, so your photos are never uploaded and there is no daily quota or account to run into.',
    blogIntro:
      'Articles about images, color and visual formats: what the different file types are actually good for, how color is written down in code, and how to choose between the options instead of guessing. Each guide links to the matching tool when you want to try it on your own files.',
  },
  {
    id: 'text-data',
    name: 'Text & Data',
    icon: FileText,
    tagline: 'Encode, decode, and extract text without uploading a thing.',
    intro:
      'Tools for moving text and documents between formats. Encode text to Base64 or decode it back, pull the words out of a screenshot or scanned page with optical character recognition, or combine a set of images into a single PDF ready to share or print. They are the small conversions that usually send you to a website that wants your file on its server first. Here the work happens inside your browser tab instead: the OCR engine downloads once and then runs locally, and nothing you paste or open is sent anywhere.',
    blogIntro:
      'Guides to the text and data formats behind everyday files: how encodings like Base64 work, why a document converts the way it does, and what to check when the output does not look right. Articles here link straight to the matching NeatSize tool so you can try each idea on your own data.',
  },
  {
    id: 'business-finance',
    name: 'Business & Finance',
    icon: Calculator,
    tagline: 'Everyday business and money calculations, done privately.',
    intro:
      'Calculators for the money questions that come up at a restaurant table, before a trip abroad, or while planning ahead. Work out a tip and split the bill evenly or by what each person ordered, convert between world currencies with live exchange rates and a year of rate history, or see how regular deposits and compound interest grow your savings over time. The numbers you type stay in your browser: only the currency converter goes online, and only to fetch published exchange rates, never to send your amounts anywhere.',
    blogIntro:
      'Plain-English guides to everyday money maths: how tips, exchange rates and compound interest actually work, what the numbers on a statement or a savings projection really mean, and the common mistakes worth avoiding when you plan, split or convert money. Each article works through real examples step by step and links to the NeatSize calculator that does the sum for you, so you can check the figures against your own situation.',
  },
  {
    id: 'developer',
    name: 'Developer',
    icon: Code,
    tagline: 'Format, validate, and analyze the things you work with daily.',
    intro:
      'Utilities for the formats you paste into a scratch tab a dozen times a day. Format and repair JSON, pretty-print SQL in several dialects, test a regular expression against real input, decode a JWT to read its claims, percent-encode a URL, build a CSS gradient, or generate a strong password. Because tokens, queries and config files often contain secrets, every tool here runs entirely in your browser: nothing you paste is logged or sent to a server, so real data never leaves your machine.',
    blogIntro:
      'Explainers for developers on the formats and standards behind everyday work: JSON and its limits, how JSON Web Tokens are built and verified, and the trade-offs between common approaches. Each article covers the why as well as the how, and links to the matching tool so you can inspect real examples.',
  },
  {
    id: 'everyday',
    name: 'Everyday',
    icon: Wrench,
    tagline: 'Small utilities for the things that come up all the time.',
    intro:
      'Quick answers to everyday questions. Convert between metric and imperial lengths, weights and temperatures, check what time it is in another city or convert a meeting time between time zones, work out an exact age in years, months and days, or calculate your body mass index along with the healthy weight range for your height. Each tool updates its answer instantly as you type, with no button to press and no page reload, and everything you enter stays in your own browser.',
    blogIntro:
      'Short, practical guides to everyday conversions and calculations: units, time zones, dates and health measures, with the reasoning behind each formula rather than just the answer. Every article links to the NeatSize tool that does the calculation for you.',
  },
  {
    id: 'fun',
    name: 'Fun',
    icon: PartyPopper,
    tagline: 'Dice, coins, and other small randomness tools - just for fun.',
    intro:
      'Fair randomness for games, decisions and classroom activities. Roll anything from a single six-sided die to a handful of D20s for a tabletop game, flip one coin or a hundred at once to settle an argument, or draw random numbers from any range with or without repeats for a raffle or a quiz. Each result is generated fresh in your browser the moment you click, with a short animation so it feels like the real thing, and every tool keeps a running history and totals so you can look back at earlier rolls, flips and draws.',
    blogIntro:
      'Articles about chance and randomness: how fair dice and coin flips really are, how computers generate random numbers, and fun ways to use them in games and decisions. Each one links to the matching NeatSize tool so you can test the ideas yourself.',
  },
];

// One object per tool. To add a new tool:
//   1. Create src/tools/<your-tool>/<YourTool>.jsx
//   2. Import it below (plus a lucide icon for it)
//   3. Add an entry to this array
// That's it - the tool automatically shows up on the homepage, in search,
// in the command palette, and becomes reachable at /tool/<id>.
//
// Fields:
//   id / name / description - identity, shown everywhere
//   category                - must match a CATEGORIES id
//   icon                    - a lucide-react component (not a string)
//   keywords                - extra search terms; users rarely type the
//                             exact tool name, so this is what makes
//                             search actually find things
//   isPopular               - surfaces the tool in the homepage's
//                             "Popular tools" row. Optional; omitting it
//                             means false. Flip this flag here and the
//                             homepage updates itself - no UI code knows
//                             which tools are popular. At most
//                             MAX_POPULAR_TOOLS (5) are ever rendered,
//                             so if more than five are flagged the extras
//                             are simply not shown (see getPopularTools).
export const tools = [
  {
    id: 'base64-encoder-decoder',
    name: 'Base64 Encoder / Decoder',
    description: 'Encode plain text into Base64, or decode Base64 back into readable text.',
    category: 'text-data',
    metaDescription:
      'Encode text to Base64 or decode Base64 back to readable text, instantly and entirely in your browser. No upload, no tracking.',
    icon: Binary,
    component: lazyWithPreload(() => import('./base64/Base64Tool.jsx')),
    keywords: ['base64', 'encode', 'decode', 'btoa', 'atob', 'text'],
  },
  {
    id: 'image-converter',
    name: 'Image Converter',
    description: 'Convert images between PNG, JPG, WebP, and AVIF - right in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Convert images between PNG, JPG, WebP, and AVIF entirely in your browser. Free, fast, and no upload required.',
    icon: Images,
    component: lazyWithPreload(() => import('./image-converter/ImageConverter.jsx')),
    keywords: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'convert', 'format', 'image'],
    isPopular: true,
  },
  {
    id: 'image-compressor',
    name: 'Image Compressor',
    description: 'Shrink image file size in your browser. Files never leave your device.',
    category: 'graphics-media',
    metaDescription:
      'Compress PNG, JPG, and WebP images to reduce file size without uploading them anywhere. Adjustable quality and optional resizing.',
    icon: Shrink,
    component: lazyWithPreload(() => import('./image-compressor/ImageCompressor.jsx')),
    keywords: ['compress', 'shrink', 'optimize', 'reduce', 'size', 'image', 'photo'],
    isPopular: true,
  },
  {
    id: 'image-resizer',
    name: 'Image Resizer & Cropper',
    description: 'Resize or crop images in your browser. Files never leave your device.',
    category: 'graphics-media',
    metaDescription:
      'Resize or crop images to exact dimensions entirely in your browser. Lock aspect ratio, use scale presets, or drag a crop selection - no upload required.',
    icon: Crop,
    component: lazyWithPreload(() => import('./image-resizer/ImageResizer.jsx')),
    keywords: ['resize', 'crop', 'scale', 'dimensions', 'aspect ratio', 'image'],
  },
  {
    id: 'image-flipper',
    name: 'Image Flipper',
    description: 'Flip images horizontally or vertically directly in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Flip images horizontally or vertically entirely in your browser using the Canvas API. Transparency preserved, no upload required.',
    icon: FlipHorizontal,
    component: lazyWithPreload(() => import('./image-flipper/ImageFlipper.jsx')),
    keywords: ['flip', 'mirror', 'horizontal', 'vertical', 'reverse', 'image'],
  },
  {
    id: 'image-rotator',
    name: 'Image Rotator',
    description: 'Rotate images by 90°, 180°, or any angle, and straighten tilted photos, in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Rotate an image 90°, 180° or by any angle and straighten tilted photos, with fit, crop or zoom-to-fill edges. Full resolution, nothing uploaded.',
    icon: RotateCw,
    component: lazyWithPreload(() => import('./image-rotator/ImageRotator.jsx')),
    keywords: ['rotate', 'rotation', 'turn', 'straighten', 'tilt', '90 degrees', 'sideways', 'image', 'photo'],
  },
  {
    id: 'exif-remover',
    name: 'EXIF Viewer & Remover',
    description: 'See the hidden metadata in your photos - GPS location, camera, date - and remove it without losing quality.',
    category: 'graphics-media',
    metaDescription:
      'View and remove photo metadata (EXIF, GPS location, camera, XMP) from JPG, PNG and WebP without re-compressing. Batch, verified, in your browser.',
    icon: MapPinOff,
    component: lazyWithPreload(() => import('./exif-remover/ExifRemover.jsx')),
    keywords: ['exif', 'metadata', 'gps', 'location', 'remove exif', 'exif viewer', 'privacy', 'photo', 'strip metadata', 'xmp'],
  },
  {
    id: 'image-filters',
    name: 'Image Filters & Adjustments',
    description: 'Adjust brightness, contrast, saturation, warmth and more, or apply one-click photo filters.',
    category: 'graphics-media',
    metaDescription:
      'Edit photos in your browser: brightness, contrast, saturation, warmth, sharpen, blur, vignette, plus one-click filters. Full resolution, no upload.',
    icon: SlidersHorizontal,
    component: lazyWithPreload(() => import('./image-filters/ImageFilters.jsx')),
    keywords: ['filter', 'brightness', 'contrast', 'saturation', 'photo editor', 'black and white', 'sepia', 'sharpen', 'blur', 'adjust', 'image'],
  },
  {
    id: 'watermark-remover',
    name: 'Watermark Remover',
    description: 'Remove simple text, logos, and unwanted areas from images directly in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Paint over a watermark, logo, or unwanted object and remove it from your image, entirely in your browser. Works on PNG, JPG, and WebP. Nothing is uploaded.',
    icon: Eraser,
    component: lazyWithPreload(() => import('./watermark-remover/WatermarkRemover.jsx')),
    keywords: ['watermark', 'remove watermark', 'logo removal', 'object removal', 'inpaint', 'image', 'edit'],
  },
  {
    id: 'add-watermark',
    name: 'Add Watermark to Image',
    description: 'Add a text or logo watermark to one image or a whole batch, in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Add a text or logo watermark to photos - set size, opacity, angle and position, or tile it. Batch-watermark many images as a ZIP. Nothing uploaded.',
    icon: Stamp,
    component: lazyWithPreload(() => import('./add-watermark/AddWatermark.jsx')),
    keywords: ['watermark', 'add watermark', 'logo', 'copyright', 'protect photos', 'text on image', 'batch', 'image'],
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    description: 'Convert one or multiple images into a high-quality PDF directly in your browser.',
    category: 'text-data',
    metaDescription:
      'Combine one or more images into a single PDF entirely in your browser. Choose page size, layout, and quality - nothing is ever uploaded.',
    icon: FileOutput,
    component: lazyWithPreload(() => import('./image-to-pdf/ImageToPdf.jsx')),
    keywords: ['image', 'pdf', 'convert', 'combine', 'merge', 'jpg to pdf', 'png to pdf', 'photos'],
  },
  {
    id: 'pdf-merge',
    name: 'PDF Merge',
    description: 'Combine multiple PDF files into one, in any order, directly in your browser.',
    category: 'text-data',
    metaDescription:
      'Merge PDF files into one document in your browser. Reorder files, pick page ranges, keep text selectable. No upload, no sign-up, no watermark.',
    icon: Merge,
    component: lazyWithPreload(() => import('./pdf-merge/PdfMerge.jsx')),
    keywords: ['pdf', 'merge', 'combine', 'join', 'pages', 'split', 'extract pages', 'documents'],
  },
  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    description: 'Convert PDF pages to PNG, JPG, or WebP images directly in your browser.',
    category: 'text-data',
    metaDescription:
      'Convert PDF pages to PNG, JPG, or WebP images at up to 300 DPI, entirely in your browser. Pick pages, download as ZIP. Nothing is uploaded.',
    icon: ImageDown,
    component: lazyWithPreload(() => import('./pdf-to-image/PdfToImage.jsx')),
    keywords: ['pdf', 'image', 'png', 'jpg', 'jpeg', 'webp', 'pdf to jpg', 'pdf to png', 'convert', 'pages'],
  },
  {
    id: 'text-diff',
    name: 'Text Diff Checker',
    description: 'Compare two texts and see every added, removed, and changed line or word.',
    category: 'text-data',
    metaDescription:
      'Compare two texts side by side and highlight every change by line, word, or character. Ignore case or whitespace, copy as a patch. Runs in your browser.',
    icon: Diff,
    component: lazyWithPreload(() => import('./text-diff/TextDiff.jsx')),
    keywords: ['diff', 'compare', 'difference', 'text compare', 'diff checker', 'changes', 'code', 'patch'],
  },
  {
    id: 'case-converter',
    name: 'Case Converter',
    description: 'Convert text to UPPERCASE, lowercase, Title Case, camelCase, snake_case and more.',
    category: 'text-data',
    metaDescription:
      'Change text case instantly: UPPERCASE, lowercase, Title Case, Sentence case, camelCase, PascalCase, snake_case, kebab-case and more. Runs in your browser.',
    icon: CaseSensitive,
    component: lazyWithPreload(() => import('./case-converter/CaseConverter.jsx')),
    keywords: ['case', 'uppercase', 'lowercase', 'title case', 'sentence case', 'camelcase', 'snake case', 'kebab case', 'capitalize', 'convert'],
  },
  {
    id: 'csv-json-converter',
    name: 'CSV to JSON Converter',
    description: 'Convert CSV to JSON and JSON back to CSV, with a table preview, right in your browser.',
    category: 'text-data',
    metaDescription:
      'Convert CSV to JSON and JSON to CSV in your browser. Auto-detects delimiters, keeps leading zeros, flattens nested JSON, and exports Excel-ready files.',
    icon: FileSpreadsheet,
    component: lazyWithPreload(() => import('./csv-json-converter/CsvJsonConverter.jsx')),
    keywords: ['csv', 'json', 'csv to json', 'json to csv', 'convert', 'spreadsheet', 'excel', 'tsv', 'table', 'parse csv'],
  },
  {
    id: 'markdown-editor',
    name: 'Markdown Editor & Preview',
    description: 'Write Markdown and see it formatted live, then export it as a .md file or an HTML page.',
    category: 'text-data',
    metaDescription:
      'Write Markdown with a live preview: GitHub-flavored tables, task lists and code highlighting. Export to .md or a styled HTML page. Nothing uploaded.',
    icon: NotebookPen,
    component: lazyWithPreload(() => import('./markdown-editor/MarkdownEditor.jsx')),
    keywords: ['markdown', 'md', 'markdown editor', 'markdown preview', 'readme', 'gfm', 'markdown to html', 'live preview', 'writer'],
  },
  {
    id: 'lorem-ipsum-generator',
    name: 'Lorem Ipsum Generator',
    description: 'Generate placeholder text by paragraphs, sentences, words, characters or list items.',
    category: 'text-data',
    metaDescription:
      'Generate lorem ipsum placeholder text: paragraphs, sentences, words, exact character counts or lists, as plain text, HTML or Markdown. Free and instant.',
    icon: Pilcrow,
    component: lazyWithPreload(() => import('./lorem-ipsum-generator/LoremIpsumGenerator.jsx')),
    keywords: ['lorem ipsum', 'placeholder text', 'dummy text', 'filler text', 'lipsum', 'generator', 'mockup', 'paragraphs'],
  },
  {
    id: 'heic-to-jpg',
    name: 'HEIC to JPG Converter',
    description: 'Convert iPhone HEIC photos to JPG in your browser. Files never leave your device.',
    category: 'graphics-media',
    metaDescription:
      'Convert iPhone HEIC/HEIF photos to JPG entirely in your browser, one or many at a time. No upload, no limits, unlike most online converters.',
    icon: Smartphone,
    component: lazyWithPreload(() => import('./heic-to-jpg/HeicToJpg.jsx')),
    keywords: ['heic', 'heif', 'iphone', 'apple', 'jpg', 'jpeg', 'photo', 'convert'],
  },
  {
    id: 'svg-to-png',
    name: 'SVG to PNG Converter',
    description: 'Convert SVG files or code to sharp PNG, JPG or WebP images at any size, in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Convert SVG to PNG, JPG or WebP at any size - sharp at 2x, 4x or exact pixels, with a transparent or colored background. Batch to ZIP, in your browser.',
    icon: Shapes,
    component: lazyWithPreload(() => import('./svg-to-png/SvgToPng.jsx')),
    keywords: ['svg', 'svg to png', 'svg to jpg', 'vector', 'rasterize', 'convert', 'icon', 'logo', 'transparent png', 'webp'],
  },
  {
    id: 'favicon-generator',
    name: 'Favicon Generator',
    description: 'Turn any image into a complete favicon package in your browser. Files never leave your device.',
    category: 'graphics-media',
    metaDescription:
      'Generate a complete favicon package (ICO, PNG sizes, web manifest, and HTML tags) from any image, entirely in your browser.',
    icon: Globe,
    component: lazyWithPreload(() => import('./favicon-generator/FaviconGenerator.jsx')),
    keywords: ['favicon', 'ico', 'icon', 'apple touch', 'manifest', 'website'],
  },
  {
    id: 'image-to-text',
    name: 'Image to Text (OCR)',
    description: 'Extract text from images in your browser using OCR. Files never leave your device.',
    category: 'text-data',
    metaDescription:
      'Extract text from images using OCR entirely in your browser, in English, Georgian, and more. No upload, no limits.',
    icon: ScanText,
    component: lazyWithPreload(() => import('./image-to-text/ImageToText.jsx')),
    keywords: ['ocr', 'extract', 'scan', 'text', 'recognize', 'screenshot', 'georgian'],
  },
  {
    id: 'color-converter',
    name: 'Color Converter',
    description:
      'Convert colors instantly between HEX, RGB, RGBA, HSL, and HSLA entirely in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Convert colors instantly between HEX, RGB, RGBA, HSL, and HSLA. Free, fast, and 100% client-side - nothing you enter ever leaves your browser.',
    icon: Palette,
    component: lazyWithPreload(() => import('./color-converter/ColorConverter.jsx')),
    keywords: ['color', 'hex', 'rgb', 'rgba', 'hsl', 'hsla', 'picker', 'css'],
  },
  {
    id: 'color-contrast-checker',
    name: 'Color Contrast Checker',
    description: 'Check whether text and background colors meet WCAG AA and AAA contrast, and get passing alternatives.',
    category: 'graphics-media',
    metaDescription:
      'Check the contrast ratio of text and background colors against WCAG AA and AAA, preview it live, and get the closest passing colors. Runs in your browser.',
    icon: Contrast,
    component: lazyWithPreload(() => import('./color-contrast-checker/ColorContrastChecker.jsx')),
    keywords: ['contrast', 'contrast checker', 'wcag', 'accessibility', 'a11y', 'contrast ratio', 'aa', 'aaa', 'color', 'readability'],
  },
  {
    id: 'image-to-base64',
    name: 'Image to Base64',
    description: 'Convert images to Base64 or Data URI format entirely in your browser. Files never leave your device.',
    category: 'graphics-media',
    metaDescription:
      'Convert PNG, JPG, WebP, GIF, BMP, or SVG images to Base64 or a Data URI entirely in your browser. No upload, no backend.',
    icon: FileImage,
    component: lazyWithPreload(() => import('./image-to-base64/ImageToBase64.jsx')),
    keywords: ['base64', 'data uri', 'inline', 'embed', 'image', 'css', 'html'],
  },
  {
    id: 'json-formatter-validator',
    name: 'JSON Formatter, Validator & Fixer',
    description:
      'Format, validate, minify, and automatically fix broken JSON instantly in your browser. Your data never leaves your device.',
    category: 'developer',
    metaDescription:
      'Format, validate, minify, and auto-fix broken JSON in your browser. One-click repair, line and column error locations, and a tree view. No upload needed.',
    icon: Braces,
    component: lazyWithPreload(() => import('./json-formatter-validator/JsonFormatter.jsx')),
    keywords: ['json', 'format', 'beautify', 'pretty print', 'minify', 'validate', 'fix', 'repair'],
    isPopular: true,
  },
  {
    id: 'yaml-json-converter',
    name: 'YAML to JSON Converter',
    description: 'Convert YAML to JSON and JSON to YAML as you type, with exact error locations.',
    category: 'developer',
    metaDescription:
      'Convert YAML to JSON and JSON to YAML instantly. Handles anchors, merge keys and multi-document files, with exact error lines. Runs in your browser.',
    icon: FileCode,
    component: lazyWithPreload(() => import('./yaml-json-converter/YamlJsonConverter.jsx')),
    keywords: ['yaml', 'yml', 'json', 'yaml to json', 'json to yaml', 'convert', 'kubernetes', 'docker compose', 'config', 'validate yaml'],
  },
  {
    id: 'qr-code-generator',
    name: 'QR Code Generator',
    description:
      'Generate customizable QR codes for URLs, text, WiFi, contacts, email, phone numbers, SMS, and locations entirely in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Create QR codes for URLs, text, email, phone, SMS, Wi-Fi, contacts, and locations in your browser. Customize colors, then export PNG or SVG. No upload.',
    icon: QrCode,
    component: lazyWithPreload(() => import('./qr-code-generator/QrCodeGenerator.jsx')),
    keywords: ['qr', 'qr code', 'barcode', 'wifi', 'vcard', 'url', 'contact', 'generate'],
    isPopular: true,
  },
  {
    id: 'qr-code-scanner',
    name: 'QR Code Scanner',
    description: 'Scan QR codes from an image, a screenshot, or your camera, right in your browser.',
    category: 'graphics-media',
    metaDescription:
      'Scan a QR code from a photo, screenshot or your camera - no app needed. Reads links, WiFi passwords, contacts and more. Nothing is uploaded.',
    icon: ScanQrCode,
    component: lazyWithPreload(() => import('./qr-code-scanner/QrCodeScanner.jsx')),
    keywords: ['qr', 'qr code', 'scan', 'scanner', 'reader', 'decode', 'camera', 'wifi', 'read qr code from image'],
  },
  {
    id: 'word-counter-text-analyzer',
    name: 'Word Counter & Text Analyzer',
    description:
      'Analyze text with live word count, character count, reading time, keyword density, readability metrics, and useful writing tools. Everything runs entirely in your browser.',
    category: 'developer',
    metaDescription:
      'Live word count, character count, reading time, keyword density, readability scores, and text cleanup tools - entirely in your browser.',
    icon: Type,
    component: lazyWithPreload(() => import('./word-counter-text-analyzer/WordCounterTextAnalyzer.jsx')),
    keywords: [
      'word count',
      'character count',
      'readability',
      'reading time',
      'keyword density',
      'case converter',
      'text',
    ],
  },
  {
    id: 'regex-tester',
    name: 'Regex Tester',
    description:
      'Test, validate, and debug regular expressions instantly in your browser with live highlighting and match details.',
    category: 'developer',
    metaDescription:
      'Test and debug regular expressions live: match highlighting, capture groups, replace preview, and a plain-English explanation. Runs in your browser.',
    icon: Regex,
    component: lazyWithPreload(() => import('./regex-tester/RegexTester.jsx')),
    keywords: [
      'regex',
      'regexp',
      'regular expression',
      'pattern',
      'match',
      'test',
      'validate',
      'debug',
      'find and replace',
    ],
  },
  {
    id: 'unit-converter',
    name: 'Unit Converter',
    description:
      'Convert units instantly between length, weight, and temperature directly in your browser.',
    category: 'everyday',
    metaDescription:
      'Convert length, weight, and temperature units instantly in your browser, with adjustable precision, the formula used, and a running history.',
    icon: Ruler,
    component: lazyWithPreload(() => import('./unit-converter/UnitConverter.jsx')),
    keywords: [
      'unit',
      'convert',
      'length',
      'weight',
      'mass',
      'temperature',
      'meters',
      'feet',
      'celsius',
      'fahrenheit',
      'kilograms',
      'pounds',
    ],
  },
  {
    id: 'tip-calculator',
    name: 'Tip Calculator & Bill Splitter',
    description:
      'Calculate tips, split restaurant bills equally or proportionally, and instantly see how much each person should pay.',
    category: 'business-finance',
    metaDescription:
      'Calculate the tip and split a bill equally or by what each person ordered. Per-person totals, rounding, multiple currencies, and a receipt download.',
    icon: Receipt,
    component: lazyWithPreload(() => import('./tip-calculator/TipCalculator.jsx')),
    keywords: [
      'tip',
      'gratuity',
      'bill split',
      'split the bill',
      'restaurant',
      'receipt',
      'group bill',
      'how much to tip',
    ],
  },
  {
    id: 'password-generator',
    name: 'Password Generator',
    description: 'Generate secure random passwords instantly in your browser.',
    category: 'developer',
    metaDescription:
      'Generate strong random passwords with the Web Crypto API. Set length and character types, exclude look-alike characters, and check strength live.',
    icon: KeyRound,
    component: lazyWithPreload(() => import('./password-generator/PasswordGenerator.jsx')),
    keywords: [
      'password',
      'generator',
      'random',
      'secure',
      'passphrase',
      'strength',
      'crypto',
    ],
    isPopular: true,
  },
  {
    id: 'currency-converter',
    name: 'Currency Converter',
    description: 'Convert between world currencies using live exchange rates with a simple historical chart.',
    category: 'business-finance',
    metaDescription:
      'Convert between world currencies with live exchange rates and a historical rate chart covering up to a year. Rates from the Frankfurter API.',
    icon: Coins,
    component: lazyWithPreload(() => import('./currency-converter/CurrencyConverter.jsx')),
    keywords: [
      'currency',
      'exchange rate',
      'forex',
      'money',
      'usd',
      'eur',
      'gbp',
      'convert',
      'historical rates',
    ],
  },
  {
    id: 'world-clock-time-zone-converter',
    name: 'World Clock & Time Zone Converter',
    description: 'Compare current times around the world and convert dates and times between different time zones.',
    category: 'everyday',
    metaDescription:
      'Compare current times around the world and convert a date and time between time zones, with live clocks, DST status, and next/previous-day flags.',
    icon: Clock,
    component: lazyWithPreload(() => import('./world-clock-time-zone-converter/WorldClockConverter.jsx')),
    keywords: [
      'time zone',
      'world clock',
      'utc',
      'gmt',
      'dst',
      'daylight saving',
      'convert time',
      'timezone converter',
    ],
  },
  {
    id: 'dice-roller',
    name: 'Dice Roller',
    description: 'Roll one or multiple virtual dice with smooth animations.',
    category: 'fun',
    metaDescription:
      'Roll one or more virtual dice from D4 to D100, with a shake-and-reveal animation, running total and average, and a history of every roll.',
    icon: Dices,
    component: lazyWithPreload(() => import('./dice-roller/DiceRoller.jsx')),
    keywords: ['dice', 'roll', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'tabletop', 'rpg', 'random'],
  },
  {
    id: 'coin-flip',
    name: 'Coin Flip',
    description: 'Flip one or multiple virtual coins with realistic animations.',
    category: 'fun',
    metaDescription:
      'Flip one coin or up to 100 at once, with a spinning animation, heads and tails totals, the percentage split, and a history of every flip.',
    icon: Disc,
    component: lazyWithPreload(() => import('./coin-flip/CoinFlip.jsx')),
    keywords: ['coin', 'flip', 'heads', 'tails', 'toss', 'random', 'decision'],
  },
  {
    id: 'random-number-generator',
    name: 'Random Number Generator',
    description: 'Generate random numbers instantly with customizable ranges.',
    category: 'fun',
    metaDescription:
      'Generate random numbers in any range: choose how many, allow or block duplicates, sort the results, and see lowest, highest, and history.',
    icon: Shuffle,
    component: lazyWithPreload(() => import('./random-number-generator/RandomNumberGenerator.jsx')),
    keywords: ['random number', 'rng', 'generator', 'range', 'lottery', 'raffle', 'pick a number'],
  },
  {
    id: 'css-gradient-generator',
    name: 'CSS Gradient Generator',
    description: 'Create beautiful CSS gradients visually and copy the generated CSS instantly.',
    category: 'developer',
    metaDescription:
      'Build linear and radial CSS gradients visually with draggable color stops, transparency, presets, and a random generator, then copy the CSS.',
    icon: Blend,
    component: lazyWithPreload(() => import('./css-gradient-generator/GradientGenerator.jsx')),
    keywords: [
      'css',
      'gradient',
      'linear gradient',
      'radial gradient',
      'color stops',
      'background',
      'generator',
    ],
  },
  {
    id: 'box-shadow-generator',
    name: 'Box Shadow Generator',
    description: 'Design CSS box shadows visually with layers and presets, then copy the CSS or Tailwind class.',
    category: 'developer',
    metaDescription:
      'Design CSS box shadows visually: layered, soft, glow, neumorphic or inset. Live preview, presets, and copy-ready CSS or Tailwind. Runs in your browser.',
    icon: Layers,
    component: lazyWithPreload(() => import('./box-shadow-generator/BoxShadowGenerator.jsx')),
    keywords: ['box shadow', 'box-shadow', 'css shadow', 'drop shadow', 'neumorphism', 'inset shadow', 'tailwind shadow', 'generator', 'css'],
  },
  {
    id: 'jwt-decoder',
    name: 'JWT Decoder & Inspector',
    description: 'Decode and inspect JSON Web Tokens (JWT) instantly in your browser without sending data to any server.',
    category: 'developer',
    metaDescription:
      'Decode a JSON Web Token in your browser: header, payload, and standard claims explained in plain English, plus expiry status and readable timestamps.',
    icon: FileKey,
    component: lazyWithPreload(() => import('./jwt-decoder/JwtDecoder.jsx')),
    keywords: ['jwt', 'json web token', 'decode', 'token', 'auth', 'bearer token', 'claims', 'base64url'],
  },
  {
    id: 'bmi-calculator',
    name: 'BMI Calculator',
    description: 'Calculate your Body Mass Index (BMI) instantly using either metric or imperial units.',
    category: 'everyday',
    metaDescription:
      'Calculate your Body Mass Index in metric or imperial units, with your BMI category, the healthy weight range for your height, and a visual scale.',
    icon: Scale,
    component: lazyWithPreload(() => import('./bmi-calculator/BmiCalculator.jsx')),
    keywords: ['bmi', 'body mass index', 'weight', 'height', 'healthy weight', 'obesity', 'underweight'],
  },
  {
    id: 'age-calculator',
    name: 'Age Calculator',
    description: 'Calculate your exact age from your date of birth.',
    category: 'everyday',
    metaDescription:
      'Calculate exact age in years, months, and days from a date of birth, plus total months, weeks, and days lived and a countdown to the next birthday.',
    icon: Cake,
    component: lazyWithPreload(() => import('./age-calculator/AgeCalculator.jsx')),
    keywords: ['age', 'age calculator', 'date of birth', 'birthday', 'how old am i'],
  },
  {
    id: 'image-color-picker',
    name: 'Image Color Picker',
    description: 'Upload an image and pick any color from it to get its HEX, RGB, and HSL values.',
    category: 'graphics-media',
    metaDescription:
      'Pick any color from an image and get its HEX, RGB, and HSL values instantly. Runs in your browser with the Canvas API, so nothing is uploaded.',
    icon: Pipette,
    component: lazyWithPreload(() => import('./image-color-picker/ImageColorPicker.jsx')),
    keywords: ['color picker', 'eyedropper', 'hex', 'rgb', 'hsl', 'image color', 'pixel color'],
  },
  {
    id: 'image-palette-extractor',
    name: 'Color Palette Extractor',
    description: 'Pull the main colors out of any image and export them as HEX codes, CSS variables or a PNG.',
    category: 'graphics-media',
    metaDescription:
      'Extract the main colors from any image as HEX, RGB and HSL. Export CSS variables, SCSS, Tailwind or JSON, or a PNG of the palette. Nothing is uploaded.',
    icon: SwatchBook,
    component: lazyWithPreload(() => import('./image-palette-extractor/ImagePaletteExtractor.jsx')),
    keywords: ['palette', 'color palette', 'extract colors', 'dominant colors', 'color scheme', 'image colors', 'palette from image', 'hex', 'brand colors'],
  },
  {
    id: 'savings-calculator',
    name: 'Savings Calculator',
    description: 'Calculate how your savings can grow over time with regular contributions and interest.',
    category: 'business-finance',
    metaDescription:
      'See how savings grow with compound interest and regular deposits: final balance, total contributions, interest earned, and a year-by-year chart.',
    icon: PiggyBank,
    component: lazyWithPreload(() => import('./savings-calculator/SavingsCalculator.jsx')),
    keywords: ['savings', 'savings calculator', 'compound interest', 'interest calculator', 'investment growth'],
  },
  {
    id: 'sql-formatter',
    name: 'SQL Formatter',
    description: 'Format, beautify, and validate SQL queries directly in your browser.',
    category: 'developer',
    metaDescription:
      'Format and beautify SQL for Generic SQL, MySQL, PostgreSQL, SQLite, and SQL Server, with syntax highlighting and adjustable style options.',
    icon: Database,
    component: lazyWithPreload(() => import('./sql-formatter/SqlFormatter.jsx')),
    keywords: ['sql', 'format', 'beautify', 'mysql', 'postgresql', 'sqlite', 'sql server', 'query', 'pretty print'],
  },
  {
    id: 'url-encoder-decoder',
    name: 'URL Encoder / Decoder',
    description: 'Encode and decode URLs and text using standard percent encoding directly in your browser.',
    category: 'developer',
    metaDescription:
      'Encode and decode URLs and text using standard percent encoding, instantly in your browser using native JavaScript APIs. Nothing is ever uploaded.',
    icon: Link2,
    component: lazyWithPreload(() => import('./url-encoder-decoder/UrlEncoderDecoder.jsx')),
    keywords: ['url', 'encode', 'decode', 'percent encoding', 'uri', 'query string', 'encodeuricomponent'],
  },
  {
    id: 'hash-generator',
    name: 'Hash Generator',
    description: 'Generate MD5, SHA-1, SHA-256 and SHA-512 hashes of text or files, and verify checksums.',
    category: 'developer',
    metaDescription:
      'Calculate MD5, SHA-1, SHA-256, SHA-384 and SHA-512 hashes of text or files, verify download checksums, and compute HMACs. Runs in your browser.',
    icon: Hash,
    component: lazyWithPreload(() => import('./hash-generator/HashGenerator.jsx')),
    keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'checksum', 'hmac', 'verify', 'digest', 'file hash'],
  },
  {
    id: 'uuid-generator',
    name: 'UUID Generator',
    description: 'Generate version 4 and version 7 UUIDs in bulk, and validate or decode any UUID.',
    category: 'developer',
    metaDescription:
      'Generate random v4 or time-ordered v7 UUIDs (GUIDs), up to 1,000 at once, in any format. Validate and decode existing UUIDs. Runs in your browser.',
    icon: Fingerprint,
    component: lazyWithPreload(() => import('./uuid-generator/UuidGenerator.jsx')),
    keywords: ['uuid', 'guid', 'v4', 'v7', 'unique id', 'random id', 'generator', 'identifier'],
  },
  {
    id: 'unix-timestamp-converter',
    name: 'Unix Timestamp Converter',
    description: 'Convert Unix timestamps to dates and dates to timestamps, in any time zone.',
    category: 'developer',
    metaDescription:
      'Convert Unix/epoch timestamps to human dates and back, in seconds, milliseconds or nanoseconds, for any time zone. Live current epoch time. In-browser.',
    icon: CalendarClock,
    component: lazyWithPreload(() => import('./unix-timestamp-converter/UnixTimestampConverter.jsx')),
    keywords: ['unix', 'timestamp', 'epoch', 'unix time', 'convert', 'date', 'milliseconds', 'iso 8601', 'time zone', 'posix'],
  },
  {
    id: 'number-base-converter',
    name: 'Number Base Converter',
    description: 'Convert numbers between binary, octal, decimal, hexadecimal and any base from 2 to 36.',
    category: 'developer',
    metaDescription:
      "Convert numbers between binary, octal, decimal, hex and any base 2-36. Exact for huge numbers, with negatives, two's complement and a clickable bit view.",
    icon: Cpu,
    component: lazyWithPreload(() => import('./number-base-converter/NumberBaseConverter.jsx')),
    keywords: ['binary', 'hex', 'hexadecimal', 'octal', 'decimal', 'base converter', 'radix', 'bits', 'twos complement', 'convert number'],
  },
];

// Groups `tools` by category, in the same order as CATEGORIES, so the
// homepage can just loop over the result. Categories with no tools yet
// are still included (with an empty list) so they always appear.
export function getToolsByCategory() {
  return CATEGORIES.map((category) => ({
    ...category,
    tools: tools.filter((tool) => tool.category === category.id),
  }));
}

// Looks up a single tool by its id. Returns undefined if not found, which
// ToolPage.jsx treats as "show a not-found message."
export function getToolById(id) {
  return tools.find((tool) => tool.id === id);
}

export function getCategoryById(id) {
  return CATEGORIES.find((category) => category.id === id);
}

// The homepage's "Popular tools" row is deliberately short - it is a
// shortcut, not a second directory, and it stops being a useful signal
// once it grows past a handful. This is the single place that limit is
// enforced, so no UI file has to remember it.
export const MAX_POPULAR_TOOLS = 5;

// Tools flagged `isPopular: true` in the registry above, capped at
// MAX_POPULAR_TOOLS. If more than that are flagged, the extras are simply
// not returned (registry order wins) rather than the row growing without
// bound - the registry stays the source of truth either way.
export function getPopularTools(limit = MAX_POPULAR_TOOLS) {
  return tools.filter((tool) => tool.isPopular).slice(0, limit);
}

// Other tools in the same category - shown at the bottom of every tool
// page so there's always somewhere useful to go next.
export function getRelatedTools(toolId, limit = 3) {
  const tool = getToolById(toolId);
  if (!tool) return [];
  return tools.filter((other) => other.category === tool.category && other.id !== toolId).slice(0, limit);
}

// Powers both the homepage search box and the ⌘K command palette.
// Matches against name, description, category name, and keywords, then
// ranks name matches above everything else so typing "json" puts the JSON
// tool first rather than whichever tool merely mentions JSON.
export function searchTools(query) {
  const q = query.trim().toLowerCase();
  if (!q) return tools;

  return tools
    .map((tool) => {
      const name = tool.name.toLowerCase();
      const categoryName = (getCategoryById(tool.category)?.name ?? '').toLowerCase();

      let score = 0;
      if (name.startsWith(q)) score = 100;
      else if (name.includes(q)) score = 80;
      else if (tool.keywords?.some((keyword) => keyword.toLowerCase().startsWith(q))) score = 60;
      else if (tool.keywords?.some((keyword) => keyword.toLowerCase().includes(q))) score = 40;
      else if (categoryName.includes(q)) score = 20;
      else if (tool.description.toLowerCase().includes(q)) score = 10;

      return { tool, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.tool);
}
