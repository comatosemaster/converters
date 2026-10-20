---
title: "Favicon Sizes Explained: Which Icon Files You Actually Need"
slug: favicon-sizes-explained
category: graphics-media
description: "A practical guide to favicon sizes: which files still matter for tabs, bookmarks, iOS home-screen icons, and web app manifests."
excerpt: You probably do not need a folder full of favicon exports. Here is the small, modern icon set that covers the common browser and device cases.
tags: [favicons, web design, icons, web manifest]
author: NeatSize
publishDate: 2026-10-20
difficulty: beginner
seoTitle: Favicon Sizes Explained
metaDescription: "Favicon sizes explained: learn which favicon.ico, PNG, Apple touch icon, and manifest files you need without shipping clutter."
relatedTools: [favicon-generator, image-resizer, image-converter]
---

## Start with the short answer: you usually need fewer files than you think

A practical favicon setup can be as small as `favicon.ico`, `apple-touch-icon.png` at 180×180, and a web app manifest that points to a couple of square PNG icons. Add a 32×32 PNG in your HTML if you want an explicit modern browser icon, and you have covered the common cases without maintaining a dozen near-identical files.

The browser tab icon, iOS home-screen icon, and install icon are related, but they are not the same target. A tab icon may appear at 16×16 or 32×32. An Apple touch icon is used when someone saves your site to an iPhone or iPad home screen. Manifest icons are used for app-like install flows, especially on Android and Chromium-based browsers.

Browsers choose from the files you provide. You do not need to handcraft every possible size if your declared sizes are sensible and your source artwork is clean. The mistake is exporting a pile of random icons, dropping them into `/public`, and assuming that more files means better support. If nothing references `favicon-96x96.png`, it may never be used.

For most websites, the useful goal is not a giant checklist. It is knowing which icons are still read by browsers and devices, then shipping those files on purpose.

## What each favicon file is for

`favicon.ico` is the old compatibility file that still earns its place. Many browsers, crawlers, feed readers, and tools look for `/favicon.ico` automatically, even when your HTML does not mention it. ICO is also useful because one file can contain multiple bitmap sizes, such as 16×16 and 32×32.

PNG favicons are the cleaner modern option for explicit HTML links. A line like this tells the browser exactly which file to use and what size it is:

```html
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
```

A PNG favicon is easy to inspect, cache, and replace. It is also easier to generate from a modern image workflow than editing an ICO file by hand.

`apple-touch-icon.png` is for Apple devices when a user saves your site to the home screen. The common safe size is 180×180. iOS can scale other sizes, but giving it a clean 180×180 square avoids many blurry or awkward results.

The web manifest is different. It is a JSON file that describes your site as an installable web app: name, theme color, start URL, display mode, and icons. Manifest icons are used for install prompts and app-like home-screen entries. They are not a universal replacement for `favicon.ico`, because plenty of non-install contexts still look for the favicon directly.

A compact setup usually includes both: favicon files for browser and bookmark contexts, plus manifest icons for app install contexts.

## The sizes that matter in practice

The favicon sizes worth caring about are mostly these:

| Size | File or use | Why it matters |
|---:|---|---|
| 16×16 | `favicon.ico` | Small browser tab and legacy contexts |
| 32×32 | `favicon.ico` or PNG | Modern tab icons, bookmarks, high-density displays |
| 48×48 | optional ICO/PNG | Older desktop and fallback contexts |
| 180×180 | `apple-touch-icon.png` | iOS and iPadOS home-screen icon |
| 192×192 | manifest PNG | Common install icon size for web apps |
| 512×512 | manifest PNG | Large install icon, splash, and store-like surfaces |

If you want to generate the files rather than resize each one manually, use the [Favicon Generator](/tool/favicon-generator) with a large square source image. It runs in your browser, so your logo or icon file is not uploaded for processing.

The small sizes matter because tab icons are tiny. A detailed logo that looks great at 512×512 can become a smudge at 16×16. If your mark has thin text, gradients, or fine outlines, consider making a simplified favicon version instead of shrinking the full logo.

Square icons scale better across these surfaces because favicon and app icon slots are square by design. If you start with a rectangle, some platforms will crop it, while others will add padding or scale it down. A crisp square source gives you more predictable exports.

ICO remains useful because it can bundle multiple sizes in a single file. That lets older or automatic favicon lookups pick the most suitable bitmap from one familiar location: `/favicon.ico`.

## What to put in HTML and what the manifest should handle

Your HTML should cover the browser-facing icons directly. A typical set looks like this:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

That gives older lookup behavior a standard `favicon.ico`, gives modern browsers a clear PNG option, tells Apple devices where the touch icon lives, and connects install-capable browsers to your manifest.

The manifest should handle app-install icons, not every icon you exported. A small manifest icon section may look like this:

```json
{
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Some projects also use `purpose`, such as `any` or `maskable`, when they need icons that adapt to launcher shapes. Add that when you have designed and tested for it; do not treat the manifest as a dumping ground for every exported size.

If you only care about a browser tab icon, the manifest is optional. A regular website can have a favicon without being installable. If you want the site to behave like an app when added to a device, the manifest becomes part of the job.

## When not to overdo it

Do not generate ten near-identical PNG files unless your framework, CMS, or target platform asks for them by name. Files like `favicon-57x57.png`, `favicon-60x60.png`, and `favicon-72x72.png` often appear in older templates, but many modern sites do not need that level of duplication.

The bigger risk is starting with artwork that is too small. Scaling a 64×64 image up to 180×180 or 512×512 will not add detail. It usually creates a soft, jagged, or fuzzy icon. Start large, then scale down.

SVG can be excellent for scalable artwork, and some browsers support SVG favicons. Still, do not rely on SVG alone if you want broad favicon behavior across browsers, saved shortcuts, crawlers, and app install surfaces. Keep bitmap fallbacks.

One perfect icon file does not cover every browser, operating system, and install surface. At the same time, a massive icon folder is not proof of better support. The right balance is a small set of referenced files, generated from a clean source, then checked in the places your users will see them.

## A sane favicon package you can ship today

A sensible favicon package for a normal website looks like this:

```text
/favicon.ico
/favicon-32x32.png
/apple-touch-icon.png
/icon-192.png
/icon-512.png
/site.webmanifest
```

Use `favicon.ico` for compatibility. Use `favicon-32x32.png` for an explicit modern browser favicon. Use `apple-touch-icon.png` at 180×180 for iOS home-screen saves. Put the 192×192 and 512×512 PNG files in your manifest for install surfaces.

This package covers the common cases without filling your project with redundant assets. It also keeps future maintenance simple: when the logo changes, you regenerate a handful of files instead of hunting through twenty filenames.

Before shipping, check the result in a desktop browser tab, a bookmark or pinned tab if your audience uses those, and a phone home-screen shortcut. Icons can look different once a platform adds rounded corners, background color, or cropping. A logo with transparent edges may look too small on a home screen, while a mark that fills the square may feel cramped in a tab.

If your source needs cleanup before export, resize or crop it with the [Image Resizer & Cropper](/tool/image-resizer). Cropping intentionally is better than letting a browser, generator, or device decide which part of your logo gets cut off.

## How to make the files from one source image

Start with a large square source image, ideally much larger than your biggest export. A 1024×1024 source gives you room to create 512×512, 192×192, 180×180, 32×32, and ICO versions without scaling upward.

The workflow is straightforward:

1. Prepare a square source image with enough padding for rounded corners and cropping.
2. Export the required PNG sizes.
3. Create `favicon.ico` with 16×16 and 32×32 inside it if your generator supports bundled sizes.
4. Add the HTML links and manifest references.
5. Test the icon where it will appear: tab, bookmark, phone home screen, and install prompt.

If your logo is not square, crop it deliberately before exporting. Stretching a wide logo into a square makes it look amateurish, and shrinking the whole rectangle often leaves the mark too small to read. In many cases, the favicon should be a symbol, monogram, or simplified version of the full brand lockup.

Need to change the source format first, such as WebP to PNG or JPG to PNG? Use the [Image Converter](/tool/image-converter) before generating the final favicon files. For the finished icon set, the [Favicon Generator](/tool/favicon-generator) is the fastest path from one clean source image to the files and references you need.