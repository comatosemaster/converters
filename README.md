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
├── App.jsx                  # Sets up the routes (homepage, category pages, tool pages)
├── index.css                # The ONE stylesheet for the whole site
├── components/
│   ├── Layout.jsx           # Header (site name + category nav), footer — wraps every page
│   ├── ToolLayout.jsx       # Gives each tool page a consistent title/description/box
│   └── ToolGrid.jsx         # The grid of tool cards, shared by Home and CategoryPage
├── hooks/
│   └── useUnsavedChangesWarning.js   # Shared "are you sure you want to leave?" browser guard
├── pages/
│   ├── Home.jsx             # Homepage — lists every tool, grouped by category
│   ├── CategoryPage.jsx     # Renders one category's tools at /category/:categoryId
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

   It should, however, call `useUnsavedChangesWarning(...)` — see the section below.

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

### Warning before losing unsaved work

Every tool should warn the user with the browser's native "Leave site?" dialog if they try to
close the tab or refresh while they have unsaved work — but only once they've actually done
something. A pristine, untouched tool should stay silent.

This is done with one shared hook: `src/hooks/useUnsavedChangesWarning.js`. It's deliberately
**not** wired through `ToolLayout` or a context provider — each tool already knows, from its own
state, whether the user has done anything worth protecting, so it just reports that directly:

```js
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';

// ... inside your component, once you know what "has unsaved work" means for this tool:
useUnsavedChangesWarning(hasUnsavedWork);
```

That's the entire integration — one import, one boolean, one line. The trick is deciding what
`hasUnsavedWork` should be for your tool. The rule of thumb: **true once there's something a
user would be annoyed to lose, false once it's saved/downloaded or cleared back to empty.**

**Closing the tab isn't the only way to lose work, though** — clicking to a different tool, going
back, or clicking a category link is just our own React app swapping what it renders, not a real
page unload. Browsers won't force their plain dialog for that, but they also don't block it for
us automatically — so there's a second, complementary piece for exactly that case:
`src/components/UnsavedChangesGuard.jsx`. It uses react-router's `useBlocker` to pause an
in-app navigation and show our own stylish "Leave without saving?" confirmation instead (see
`.modal`/`.modal-overlay` in `index.css` if you want to restyle it). Render it once anywhere in
your tool's JSX, passing the exact same boolean:

```js
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';

// ... inside your component's returned JSX, anywhere (it renders nothing until triggered):
<UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
```

So a new tool's full opt-in is: compute `hasUnsavedWork`, call the hook, render the guard — three
lines total, all driven by the one boolean you already worked out. (This is also the reason
`src/App.jsx` uses react-router's "data router" form — `createBrowserRouter`/`RouterProvider` —
instead of the plainer `<BrowserRouter>`/`<Routes>` JSX; `useBlocker` requires it.)

**A third case:** some tools have their own destructive button that isn't a "leave the page" action
at all — e.g. "Choose a different image" or "Clear all" wipe the current file/result immediately,
with no navigation and no page unload for either of the two mechanisms above to catch. For any
button like that, confirm first if `hasUnsavedWork` is true, using the same
`src/components/ConfirmDialog.jsx` the navigation guard is built from:

```js
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const [showResetConfirm, setShowResetConfirm] = useState(false);

function handleChooseAnotherClick() {
  if (hasUnsavedWork) setShowResetConfirm(true);
  else handleReset();
}

// ... in your JSX:
{showResetConfirm && (
  <ConfirmDialog
    title="Discard this image?"
    message="You have unsaved work on this image. Choosing a different one will discard it."
    confirmLabel="Discard and choose another"
    onCancel={() => setShowResetConfirm(false)}
    onConfirm={() => { setShowResetConfirm(false); handleReset(); }}
  />
)}
```

Every image tool's "Choose a different image" button (and HEIC to JPG's "Clear all") follows this
exact pattern — copy whichever is closest to your tool's shape.

Here's what each existing tool passes, as a reference:

| Tool | `hasUnsavedWork` expression | Why |
| --- | --- | --- |
| Base64 | `input.length > 0 && input !== savedInput` | Text in the box counts as work; clicking Copy remembers that input as "saved" so it stops warning — until the box is edited again. |
| Image Converter / Compressor / Resizer | `Boolean(file) && (!outputBlob \|\| outputBlob !== downloadedBlob)` | Picking a file alone counts as work (it took effort to choose). Clicking Download remembers *that exact result* as saved — if you then change any setting, a new `outputBlob` is produced, it no longer matches `downloadedBlob`, and the warning comes back. |
| HEIC to JPG | `items.some(item => item.status !== 'error' && !item.downloaded)` | A batch of files: as long as any photo is still converting or finished-but-not-downloaded, there's something to lose. Clearing the list or downloading everything turns it off. |

Notice the pattern repeating: rather than a plain "has X changed from default" flag, most tools
compare their *current* result to whatever was last saved/downloaded — an object/string
reference match means "already safe," any difference means "new work since then." Reuse that
same idea for your tool rather than inventing a new shape.

### Paste-to-upload

Every tool should also accept a pasted image (Ctrl+V / Cmd+V) at any time — not just while the
drop zone is empty — handy for screenshots, since there's often no file on disk to drag in. This
is another shared hook, `src/hooks/usePasteToUpload.js`, called once alongside the others:

```js
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';

// ... inside your component, listening at all times:
usePasteToUpload(true, handlePastedFile);
```

Pasting is always listening (the first argument is only there in case a tool needs to disable it
for some reason). Because it's always on, pasting a new image can throw away unsaved work just
like "Choose a different image" can — so route it through the **same discard confirmation**
rather than calling `handleFile` directly. The established shape (see any existing tool) is:

```js
const [pendingFile, setPendingFile] = useState(null); // holds a paste while confirming

function handlePastedFile(newFile) {
  if (hasUnsavedWork) {
    setPendingFile(newFile);
    setShowResetConfirm(true);
  } else {
    handleFile(newFile);
  }
}

// In the ConfirmDialog's onConfirm: if (pendingFile) { handleFile(pendingFile); setPendingFile(null); } else { handleReset(); }
```

For a tool that accepts multiple files at once (like HEIC to JPG, whose drop zone never hides and
where adding a file isn't destructive), there's nothing to discard — just adapt the callback to
its `handleFiles` function: `usePasteToUpload(true, (file) => handleFiles([file]))`.

Remember to update the drop zone's own text (`.drop-zone-title`) to mention pasting, so it's
actually discoverable — every existing tool's says "Drag & drop, paste, or click to browse".

### Undo/redo for one-click transforms

Any tool with buttons that rewrite the whole editor at once (case conversion, "sort lines",
"remove duplicates," ...) should let the user undo one of those clicks — a `<textarea>`'s own
native Ctrl+Z doesn't help here, since it only tracks real typed keystrokes, not programmatic
`setState` calls. `src/hooks/useUndoRedo.js` wraps a piece of state with a small undo/redo
snapshot stack for exactly this:

```js
import { useUndoRedo } from '../../hooks/useUndoRedo.js';

// `set` records history (use it from buttons); `setWithoutHistory` doesn't
// (use it for the textarea's own onChange, so plain typing still relies on
// the browser's native undo instead of filling your stack one keystroke
// at a time).
const { value: text, set: applyChange, setWithoutHistory: setText, undo, redo, canUndo, canRedo } =
  useUndoRedo('');

// <textarea value={text} onChange={(e) => setText(e.target.value)} />
// <button onClick={() => applyChange(someTransform(text))}>Do a thing</button>
// <button onClick={undo} disabled={!canUndo}>Undo</button>
```

If you also want Ctrl+Z/Ctrl+Y to trigger it, wire a scoped `onKeyDown` on the textarea itself
(not a global `window` listener) that only calls `undo()`/`redo()` — and only calls
`event.preventDefault()` — when `canUndo`/`canRedo` is true; otherwise let the key press fall
through untouched so native typing-undo still works when there's nothing of yours to undo. See
`WordCounterTextAnalyzer.jsx` for the exact pattern.

## Deploying to Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- `wrangler.jsonc` at the project root already configures SPA fallback (`not_found_handling:
  "single-page-application"`), so client-side routes (like `/tool/base64-encoder-decoder`) work
  correctly on a hard refresh or direct link. (An older approach used a `public/_redirects`
  file, but Cloudflare's newer asset-hosting pipeline flags that pattern as a false-positive
  "infinite loop" — `wrangler.jsonc` is the current recommended way.)
