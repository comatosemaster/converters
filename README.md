# Toolbox

A collection of small, free, browser-only utilities (image conversion, text formatting, QR
codes, etc.), organized into categories. Everything runs 100% client-side — there is no backend,
no database, and no data ever leaves the visitor's browser. Built with Vite + React, deployed as
a static site.

## Running it locally

```
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

Other useful commands:

- `npm run build` — builds the production-ready static site into `dist/`
- `npm run preview` — serves that `dist/` build locally so you can double-check it before deploying

## Folder structure

```
src/
├── main.jsx                 # React entry point — you shouldn't need to touch this
├── App.jsx                  # Sets up the routes (homepage, tool pages)
├── index.css                # The ONE stylesheet for the whole site
├── components/
│   ├── Layout.jsx           # Header (site name + category nav), footer — wraps every page
│   └── ToolLayout.jsx       # Gives each tool page a consistent title/description/box
├── pages/
│   ├── Home.jsx             # Homepage — lists every tool, grouped by category
│   ├── ToolPage.jsx         # Renders whichever tool matches the URL's /tool/:id
│   └── NotFound.jsx         # Shown for bad URLs
└── tools/
    ├── registry.js          # ⭐ THE LIST OF EVERY TOOL — see below
    └── base64/
        └── Base64Tool.jsx   # The reference tool (copy this folder for new tools)

public/
└── _redirects               # Tells Cloudflare Pages to send all URLs to index.html
                              # (needed so refreshing e.g. /tool/base64-encoder-decoder works)
```

## How the tool registry works

`src/tools/registry.js` is the single place that lists every tool on the site. The homepage,
the header navigation, and the routing all read from this file automatically. **You never need
to edit `Home.jsx`, `App.jsx`, or the nav to add a new tool** — one new file plus one new entry
in the registry is the whole job.

Each entry looks like this:

```js
{
  id: 'base64-encoder-decoder',       // used in the URL: /tool/base64-encoder-decoder
  name: 'Base64 Encoder / Decoder',   // shown as the page title and card name
  description: 'Encode plain text into Base64, or decode Base64 back into readable text.',
  category: 'text-data',              // must match one of the CATEGORIES ids below
  icon: '🔤',                         // any emoji, shown on the homepage card
  component: Base64Tool,              // the React component that does the actual work
}
```

The five categories (`CATEGORIES` in the same file) are fixed: `graphics-media`, `text-data`,
`business-finance`, `developer`, `everyday`.

### Recipe: adding a new tool

Say you want to add a "Word Counter" tool under Text & Data.

1. **Create a folder and component** for it:
   ```
   src/tools/word-counter/WordCounter.jsx
   ```
   Write a normal React component with whatever inputs/logic it needs. Look at
   `src/tools/base64/Base64Tool.jsx` as a template — copy it and rework the inside.

   Important: your component does **not** need to render `<ToolLayout>`, an `<h1>`, or a
   description — the routing does that for you automatically using the `name`/`description`
   you put in the registry. Just build the tool's actual UI (inputs, buttons, results).

2. **Import it and add one entry** to `src/tools/registry.js`:
   ```js
   import WordCounter from './word-counter/WordCounter.jsx';
   // ...
   export const tools = [
     { id: 'base64-encoder-decoder', /* ... */ },
     {
       id: 'word-counter',
       name: 'Word Counter',
       description: 'Count words, characters, and lines in any text.',
       category: 'text-data',
       icon: '📝',
       component: WordCounter,
     },
   ];
   ```

3. **Save and check the dev server.** The new tool now appears automatically on the homepage
   under "Text & Data," in the site as `/tool/word-counter`, and it's reachable from the nav.

That's the entire process — repeat it for tool #3, #4, and so on.

### Styling new tools

`src/index.css` already has reusable classes for common form pieces: `.field`,
`textarea`, `button.copy-button` / `.swap-button` / `.mode-button`, `.field-error`. Reuse
those classes in new tool components so everything looks consistent without writing new CSS
each time. If a tool needs something bespoke, add a new section to `index.css` (it's organized
with `=== N. Section name ===` comment headers so it's easy to find your way around).

## Deploying to Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- The `public/_redirects` file is already set up so client-side routes (like
  `/tool/base64-encoder-decoder`) work correctly on a hard refresh or direct link.
