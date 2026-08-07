// -----------------------------------------------------------------------
// BLOG CONTENT SYSTEM - no UI here. Loads every article in
// src/content/blog/*.md at build time, parses its frontmatter + markdown
// body, and exposes query helpers (by slug, by category, featured,
// search, related tools/articles, prev/next) that the blog pages and
// components read from - the same "one registry, many readers" shape as
// src/tools/registry.js.
//
// Adding a new article is just adding a new .md file here - nothing in
// this file (or any page/component) needs to change. See
// src/content/blog/_TEMPLATE.md for the frontmatter schema and markdown
// conventions (callouts, code blocks) new articles should follow.
// -----------------------------------------------------------------------

import { marked } from 'marked';
import { CATEGORIES, getCategoryById, tools } from '../tools/registry.js';
import { parseFrontmatter } from './frontmatter.js';

const AVERAGE_WORDS_PER_MINUTE = 200;

// Re-exported so existing importers keep working. The parser itself lives
// in frontmatter.js because the content pipeline needs it too, and it has
// to run in plain Node (no Vite features) - see that file's header.
export { parseFrontmatter };

// --- Markdown rendering ------------------------------------------------

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// GitHub's "> [!NOTE]" / "[!TIP]" / "[!WARNING]" alert convention - chosen
// because it's a real, widely-used markdown convention (rather than a
// bespoke fence syntax this project would have to document from scratch),
// which also means an AI writing articles is likely to already know it.
// A plain blockquote with no marker still renders as an ordinary "Quotes"
// block below.
const CALLOUT_ICONS = {
  note: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>',
  tip: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>',
};
const CALLOUT_LABELS = { note: 'Note', tip: 'Tip', warning: 'Warning' };

// Maps a fenced code block's language tag to the Prism component id that
// highlights it - see highlightArticleCode() in prismHighlight.js, which
// only ever loads the languages actually present in the current article.
const LANGUAGE_ALIASES = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
};

// Builds one renderer per call (rather than mutating a single shared
// `marked` instance) so headings collected while rendering one article
// can never leak into another - this runs once per file at build time via
// import.meta.glob(), not per-request, so the small extra allocation cost
// doesn't matter.
function renderMarkdown(body) {
  const headings = [];
  const usedSlugs = new Map();

  const renderer = {
    heading(token) {
      const text = this.parser.parseInline(token.tokens);
      const plainText = token.text;

      if (token.depth > 3) {
        return `<h${token.depth}>${text}</h${token.depth}>\n`;
      }

      let id = slugify(plainText);
      const count = usedSlugs.get(id) ?? 0;
      usedSlugs.set(id, count + 1);
      if (count > 0) id = `${id}-${count + 1}`;

      headings.push({ id, text: plainText, depth: token.depth });
      return `<h${token.depth} id="${id}"><a class="heading-anchor" href="#${id}" aria-label="Link to this section">${text}</a></h${token.depth}>\n`;
    },

    blockquote(token) {
      const match = token.text.match(/^\[!(NOTE|TIP|WARNING)\]\s*\n*([\s\S]*)$/i);
      if (match) {
        const kind = match[1].toLowerCase();
        const rest = match[2].trim();
        const bodyHtml = rest ? marked.parse(rest) : '';
        return `<div class="callout callout-${kind}" role="note"><div class="callout-icon">${CALLOUT_ICONS[kind]}</div><div class="callout-body"><p class="callout-label">${CALLOUT_LABELS[kind]}</p>${bodyHtml}</div></div>\n`;
      }
      return `<blockquote>${this.parser.parse(token.tokens)}</blockquote>\n`;
    },

    code(token) {
      const lang = (token.lang || '').trim().split(/\s+/)[0].toLowerCase();
      const prismLang = LANGUAGE_ALIASES[lang] || lang || 'text';
      const label = lang || 'text';
      return (
        `<div class="code-block" data-language="${prismLang}">` +
        `<div class="code-block-header"><span class="code-block-lang">${escapeHtml(label)}</span>` +
        `<button type="button" class="code-copy-button" data-copy-code aria-label="Copy code to clipboard">Copy</button></div>` +
        `<pre><code class="language-${prismLang}">${escapeHtml(token.text)}</code></pre></div>\n`
      );
    },

    image(token) {
      const alt = escapeHtml(token.text || '');
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<img src="${token.href}" alt="${alt}"${title} class="article-image" loading="lazy" decoding="async" />`;
    },

    table(token) {
      const header = `<tr>${token.header.map((cell, i) => `<th align="${token.align[i] || ''}">${this.parser.parseInline(cell.tokens)}</th>`).join('')}</tr>`;
      const rows = token.rows
        .map(
          (row) =>
            `<tr>${row.map((cell, i) => `<td align="${token.align[i] || ''}">${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`,
        )
        .join('');
      return `<div class="table-scroll"><table><thead>${header}</thead><tbody>${rows}</tbody></table></div>\n`;
    },
  };

  marked.use({ gfm: true, breaks: false, renderer });
  const html = marked.parse(body);
  return { html, headings };
}

function computeReadingTime(body) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / AVERAGE_WORDS_PER_MINUTE));
}

// --- Loading every article --------------------------------------------

// Eagerly (synchronously, at build time) reads every article's raw
// markdown text - `[!...]` excludes files starting with an underscore, so
// _TEMPLATE.md documents the schema without becoming a real article.
const articleModules = import.meta.glob(['../content/blog/*.md', '!../content/blog/_*.md'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

function buildArticle(path, raw) {
  const { data, body } = parseFrontmatter(raw);
  const { html, headings } = renderMarkdown(body);

  const filenameSlug = path.split('/').pop().replace(/\.md$/, '');
  const slug = data.slug || filenameSlug;

  return {
    id: data.id || slug,
    slug,
    title: data.title || slug,
    category: data.category || 'everyday',
    description: data.description || '',
    excerpt: data.excerpt || data.description || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    author: data.author || 'Rootconverter Team',
    publishDate: data.publishDate ? new Date(data.publishDate) : new Date(),
    updatedDate: data.updatedDate ? new Date(data.updatedDate) : null,
    featured: Boolean(data.featured),
    difficulty: data.difficulty || null,
    readingTime: data.readingTime ? Number(data.readingTime) : computeReadingTime(body),
    coverImage: data.coverImage || null,
    seoTitle: data.seoTitle || data.title || slug,
    metaDescription: data.metaDescription || data.description || '',
    relatedTools: Array.isArray(data.relatedTools) ? data.relatedTools : [],
    relatedArticles: Array.isArray(data.relatedArticles) ? data.relatedArticles : [],
    html,
    headings,
  };
}

// Every article, sorted newest-first - the order most of the site (latest
// articles, prev/next, category listings) wants by default.
export const articles = Object.entries(articleModules)
  .map(([path, raw]) => buildArticle(path, raw))
  .sort((a, b) => b.publishDate - a.publishDate);

// --- Query helpers -------------------------------------------------------

export function getArticleBySlug(slug) {
  return articles.find((article) => article.slug === slug);
}

export function getFeaturedArticles() {
  return articles.filter((article) => article.featured);
}

export function getLatestArticles(limit = 6) {
  return articles.slice(0, limit);
}

export function getArticlesByCategory(categoryId) {
  return articles.filter((article) => article.category === categoryId);
}

// Mirrors registry.js's getToolsByCategory() shape, so the blog homepage
// and category cards can map over it the same way ToolGrid's callers do.
export function getArticlesGroupedByCategory() {
  return CATEGORIES.map((category) => ({
    ...category,
    articles: articles.filter((article) => article.category === category.id),
  }));
}

// Explicit `relatedArticles` slugs come first (they're a deliberate
// editorial choice); if there aren't enough, the same-category articles
// fill in the rest - the same "explicit override, category fallback"
// shape as registry.js's getRelatedTools().
export function getRelatedArticles(slug, limit = 3) {
  const article = getArticleBySlug(slug);
  if (!article) return [];

  const explicit = article.relatedArticles
    .map((relatedSlug) => getArticleBySlug(relatedSlug))
    .filter((found) => found && found.slug !== slug);

  const fallback = articles.filter(
    (other) => other.category === article.category && other.slug !== slug && !explicit.includes(other),
  );

  return [...explicit, ...fallback].slice(0, limit);
}

// Reverse lookup for the "Related articles" section on a TOOL page - scans
// every article's `relatedTools` metadata rather than the tool needing to
// know anything about the blog. This is what keeps the relationship
// metadata-driven instead of hardcoded in two places.
export function getArticlesForTool(toolId, limit = 3) {
  return articles.filter((article) => article.relatedTools.includes(toolId)).slice(0, limit);
}

export function getRelatedToolsForArticle(article) {
  return article.relatedTools.map((toolId) => tools.find((tool) => tool.id === toolId)).filter(Boolean);
}

// Previous/next in the same newest-first order the rest of the blog uses,
// so "Next article" always means "a bit older."
export function getAdjacentArticles(slug) {
  const index = articles.findIndex((article) => article.slug === slug);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? articles[index - 1] : null,
    next: index < articles.length - 1 ? articles[index + 1] : null,
  };
}

// Powers the blog's search box. Matches title, description/excerpt,
// category name, and tags - ranked so a title match outranks a tag-only
// match, the same scoring shape as registry.js's searchTools().
export function searchArticles(query) {
  const q = query.trim().toLowerCase();
  if (!q) return articles;

  return articles
    .map((article) => {
      const title = article.title.toLowerCase();
      const categoryName = (getCategoryById(article.category)?.name ?? '').toLowerCase();

      let score = 0;
      if (title.startsWith(q)) score = 100;
      else if (title.includes(q)) score = 80;
      else if (article.tags.some((tag) => tag.toLowerCase().startsWith(q))) score = 60;
      else if (article.tags.some((tag) => tag.toLowerCase().includes(q))) score = 40;
      else if (categoryName.includes(q)) score = 20;
      else if ((article.description + ' ' + article.excerpt).toLowerCase().includes(q)) score = 10;

      return { article, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.article);
}

export function formatArticleDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
