import { Marked } from 'marked';
import DOMPurify from 'dompurify';

// -----------------------------------------------------------------------
// Markdown rendering + editing helpers for the Markdown Editor - no UI here.
//
// Rendering is `marked` (GitHub-flavored Markdown: tables, task lists,
// strikethrough, autolinks) followed by DOMPurify. The sanitizing step
// matters because Markdown allows raw HTML: pasting someone else's
// README could otherwise run a <script> or an onerror="..." handler
// inside this page. DOMPurify strips anything executable and keeps the
// formatting.
//
// A separate Marked instance is used (not the shared `marked` export) so
// the blog's custom renderer - registered globally in blogUtils.js - never
// leaks into this tool, and vice versa.
// -----------------------------------------------------------------------

export const EXAMPLE_MARKDOWN = `# Project notes

Write **Markdown** on the left and see it _formatted_ on the right.
Everything stays in your browser.

## Features

- Headings, **bold**, _italic_ and ~~strikethrough~~
- [Links](https://neatsize.com) and images
- Tables, task lists and code with syntax highlighting

### To-do

- [x] Draft the README
- [ ] Add screenshots
- [ ] Publish

| Format | Typical use      | Comments allowed |
| ------ | ---------------- | :--------------: |
| JSON   | APIs             |        No        |
| YAML   | Config files     |       Yes        |
| CSV    | Spreadsheets     |        No        |

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

> **Tip:** use the toolbar or Ctrl+B / Ctrl+I / Ctrl+K while typing.

---

Inline \`code\`, and a footnote-style link: see the [Markdown guide][guide].

[guide]: https://commonmark.org/help/
`;

const LANGUAGE_ALIASES = {
  js: 'javascript',
  ts: 'typescript',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  py: 'python',
};

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Heading ids, so in-document links like [Setup](#setup) work. Keeps
// letters from any alphabet (Georgian, Cyrillic...), like GitHub does.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function codeLanguage(lang) {
  const id = (lang || '').trim().split(/\s+/)[0].toLowerCase();
  const prism = LANGUAGE_ALIASES[id] || id;
  // Only a plain language name is used as a class / Prism component id.
  // (`in {}` also rules out names like "constructor" that exist on every
  // object and would confuse the language loader.)
  return /^[a-z0-9+#-]+$/.test(prism) && !(prism in {}) ? { label: id, prism } : { label: id ? id : 'text', prism: 'text' };
}

function buildMarked({ breaks, forExport }) {
  const usedSlugs = new Map();
  const instance = new Marked({ gfm: true, breaks });
  instance.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(inner) || 'section';
        const count = usedSlugs.get(id) ?? 0;
        usedSlugs.set(id, count + 1);
        if (count > 0) id = `${id}-${count}`;
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const { label, prism } = codeLanguage(lang);
        const code = `<pre><code class="language-${prism}">${escapeHtml(text)}</code></pre>`;
        // The exported HTML gets plain <pre> blocks; the preview gets the
        // site's code-block frame with a language label and Copy button.
        if (forExport) return `${code}\n`;
        return (
          `<div class="code-block"><div class="code-block-header"><span class="code-block-lang">${escapeHtml(label || 'text')}</span>` +
          `<button type="button" class="code-copy-button" data-copy-code>Copy</button></div>${code}</div>\n`
        );
      },
    },
  });
  return instance;
}

let purifier = null;

// Created on first use, in the browser only - DOMPurify needs a real DOM,
// and this module is also loaded while pages are prerendered at build time.
function getPurifier() {
  if (purifier) return purifier;
  purifier = DOMPurify;
  // Links in the preview open in a new tab, so clicking one never
  // navigates away from (and loses) the document being written.
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href') && !node.getAttribute('href').startsWith('#')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return purifier;
}

/** Markdown -> sanitized HTML. Returns '' outside a browser. */
export function renderMarkdown(markdown, { breaks = false, forExport = false } = {}) {
  if (typeof window === 'undefined' || !markdown) return '';
  const raw = buildMarked({ breaks, forExport }).parse(markdown);
  const clean = getPurifier().sanitize(raw, { ADD_ATTR: ['target'] });
  // Wide tables scroll sideways inside their own box instead of
  // stretching the preview.
  return forExport ? clean : clean.replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>');
}

const EXPORT_CSS = `body{margin:0;background:#fff;color:#1f2328;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:780px;margin:0 auto;padding:40px 20px}
h1,h2,h3,h4{line-height:1.3;margin:1.6em 0 .6em}h1{font-size:2em}h2{font-size:1.5em;border-bottom:1px solid #d8dee4;padding-bottom:.3em}
a{color:#0969da}img{max-width:100%}hr{border:0;border-top:1px solid #d8dee4;margin:2em 0}
code{font-family:ui-monospace,Consolas,monospace;font-size:.9em;background:#f3f4f6;padding:.15em .35em;border-radius:4px}
pre{background:#f6f8fa;padding:16px;border-radius:8px;overflow:auto}pre code{background:none;padding:0}
blockquote{margin:1em 0;padding:0 1em;border-left:4px solid #d0d7de;color:#59636e}
table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #d0d7de;padding:6px 12px}th{background:#f6f8fa}
li:has(>input[type=checkbox]){list-style:none}li>input[type=checkbox]{margin:0 .4em 0 -1.4em}`;

/** A complete, self-contained .html file for the rendered document. */
export function buildHtmlDocument(markdown, { breaks = false } = {}) {
  const body = renderMarkdown(markdown, { breaks, forExport: true });
  const firstHeading = markdown.match(/^#{1,6}\s+(.+)$/m)?.[1].replace(/[*_`~[\]]/g, '').trim();
  const title = escapeHtml(firstHeading || 'Document');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${EXPORT_CSS}
</style>
</head>
<body>
<main>
${body}</main>
</body>
</html>
`;
}

/** Word/character/reading-time stats, counted on the visible text. */
export function documentStats(markdown, html) {
  const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const words = visibleText.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return {
    words,
    characters: markdown.length,
    lines: markdown ? markdown.split('\n').length : 0,
    readingMinutes: Math.max(1, Math.round(words / 200)),
  };
}

// --- Toolbar formatting ------------------------------------------------------
//
// Each action looks at the text and the current selection and returns ONE
// replacement: { start, end, insert, selectStart, selectEnd } - replace
// value[start..end) with `insert`, then select selectStart..selectEnd.
// Making every edit a single replacement is what lets the editor apply it
// as one undoable step (see applyEdit in MarkdownEditor.jsx).

function wrapInline(value, start, end, marker, placeholder) {
  const selected = value.slice(start, end);
  // Already wrapped -> unwrap, so pressing Bold twice undoes it.
  if (
    value.slice(start - marker.length, start) === marker &&
    value.slice(end, end + marker.length) === marker
  ) {
    return { start: start - marker.length, end: end + marker.length, insert: selected, selectStart: start - marker.length, selectEnd: end - marker.length };
  }
  const text = selected || placeholder;
  return {
    start,
    end,
    insert: `${marker}${text}${marker}`,
    selectStart: start + marker.length,
    selectEnd: start + marker.length + text.length,
  };
}

function lineRange(value, start, end) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  // A selection ending right after a line break shouldn't pull in the
  // (unselected) next line.
  const effectiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextBreak = value.indexOf('\n', effectiveEnd);
  return { lineStart, lineEnd: nextBreak === -1 ? value.length : nextBreak };
}

const PREFIX_PATTERNS = {
  heading: /^#{1,6}\s+/,
  bullet: /^[-*+]\s+(?!\[[ xX]\]\s)/,
  number: /^\d+[.)]\s+/,
  task: /^[-*+]\s+\[[ xX]\]\s+/,
  quote: /^>\s?/,
};

function prefixLines(value, start, end, kind) {
  const { lineStart, lineEnd } = lineRange(value, start, end);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const pattern = PREFIX_PATTERNS[kind];
  const nonEmpty = lines.filter((line) => line.trim());
  const allHave = nonEmpty.length > 0 && nonEmpty.every((line) => pattern.test(line));

  let n = 0;
  const next = lines.map((line) => {
    if (allHave) return line.replace(pattern, '');
    if (!line.trim() && lines.length > 1) return line;
    // Replace any other list/heading marker rather than stacking them
    // ("- ## item").
    const bare = line.replace(/^(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, '');
    n += 1;
    if (kind === 'heading') return `## ${bare}`;
    if (kind === 'bullet') return `- ${bare}`;
    if (kind === 'number') return `${n}. ${bare}`;
    if (kind === 'task') return `- [ ] ${bare}`;
    return `> ${bare}`;
  });
  const insert = next.join('\n');
  return { start: lineStart, end: lineEnd, insert, selectStart: lineStart, selectEnd: lineStart + insert.length };
}

// Block snippets go on their own lines, with blank lines around them as
// Markdown needs.
function insertBlock(value, start, end, block, selectOffset = 0, selectLength = 0) {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const insert = `${lead}${block}${trail}`;
  const selectStart = start + lead.length + selectOffset;
  return { start, end, insert, selectStart, selectEnd: selectStart + selectLength };
}

export function formatAction(action, value, start, end) {
  const selected = value.slice(start, end);
  switch (action) {
    case 'bold':
      return wrapInline(value, start, end, '**', 'bold text');
    case 'italic':
      return wrapInline(value, start, end, '_', 'italic text');
    case 'strike':
      return wrapInline(value, start, end, '~~', 'struck text');
    case 'code':
      return wrapInline(value, start, end, '`', 'code');
    case 'link': {
      const looksLikeUrl = /^https?:\/\/\S+$/.test(selected);
      const text = looksLikeUrl ? 'link text' : selected || 'link text';
      const url = looksLikeUrl ? selected : 'https://';
      const insert = `[${text}](${url})`;
      // Select whichever part still needs typing.
      return looksLikeUrl
        ? { start, end, insert, selectStart: start + 1, selectEnd: start + 1 + text.length }
        : { start, end, insert, selectStart: start + text.length + 3, selectEnd: start + text.length + 3 + url.length };
    }
    case 'image': {
      const alt = selected || 'description';
      const insert = `![${alt}](https://)`;
      return { start, end, insert, selectStart: start + alt.length + 4, selectEnd: start + alt.length + 12 };
    }
    case 'heading':
    case 'bullet':
    case 'number':
    case 'task':
    case 'quote':
      return prefixLines(value, start, end, action);
    case 'codeblock': {
      const body = selected || 'code';
      return insertBlock(value, start, end, `\`\`\`\n${body}\n\`\`\``, 4, body.length);
    }
    case 'table':
      return insertBlock(value, start, end, '| Column 1 | Column 2 |\n| -------- | -------- |\n| Cell     | Cell     |', 2, 8);
    case 'hr':
      return insertBlock(value, start, end, '---', 3);
    default:
      return null;
  }
}
