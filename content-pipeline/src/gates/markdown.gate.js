// -----------------------------------------------------------------------
// GATE: markdown  (Tier 0 - deterministic, free)
//
// Checks the body against the conventions the article template actually
// depends on. These aren't style preferences - each one corresponds to
// something that renders wrong, or renders confusingly, on the live site:
//
//   - An h1 in the body produces TWO h1s on the page, because
//     BlogArticlePage.jsx already renders one from the frontmatter title.
//   - Only h2/h3 get anchor ids and appear in the table of contents (see
//     renderMarkdown() in blogUtils.js), so an h4-led section is
//     unreachable from the TOC.
//   - A code fence without a language gets no syntax highlighting.
//
// Parsing uses `marked` - the same parser the site renders with - so
// "does this parse" means exactly what it means at render time.
// -----------------------------------------------------------------------

import { marked } from 'marked';
import { buildVerdict, error, warn } from '../util/verdict.js';
import { countWords, stripMarkdown } from '../util/text.js';
import { thresholds } from '../../config/thresholds.js';

export const id = 'markdown';
export const tier = 0;

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Walks the token tree collecting the node types we care about. Headings
// and code blocks can be nested inside lists and blockquotes, so a flat
// scan of the top level would miss them.
function collect(tokens, acc = { headings: [], code: [], images: [], links: [], tables: 0 }) {
  for (const token of tokens ?? []) {
    if (token.type === 'heading') acc.headings.push({ depth: token.depth, text: token.text });
    else if (token.type === 'code') acc.code.push({ lang: token.lang ?? '', text: token.text });
    else if (token.type === 'image') acc.images.push({ href: token.href, text: token.text });
    else if (token.type === 'link') acc.links.push({ href: token.href });
    else if (token.type === 'table') acc.tables++;

    if (token.tokens) collect(token.tokens, acc);
    if (token.items) collect(token.items, acc);
    if (token.rows) for (const row of token.rows) for (const cell of row) collect(cell.tokens, acc);
    if (token.header) for (const cell of token.header) collect(cell.tokens, acc);
  }
  return acc;
}

export async function run({ body }) {
  const findings = [];

  let tokens;
  try {
    tokens = marked.lexer(body);
  } catch (parseError) {
    // If it doesn't parse, nothing else is worth reporting - every other
    // finding would be noise from the same root cause.
    return buildVerdict(id, [
      error('markdown.parse', `Markdown failed to parse: ${parseError.message}`, {
        fixHint: 'Usually an unclosed code fence or a malformed table.',
      }),
    ]);
  }

  const { headings, code, images } = collect(tokens);

  // --- Heading structure ------------------------------------------------

  for (const heading of headings) {
    if (heading.depth === 1) {
      findings.push(
        error('markdown.h1', `Body contains an h1 ("${heading.text}").`, {
          location: { heading: heading.text },
          fixHint: 'The page renders its h1 from the frontmatter title. Start body sections at "##".',
        }),
      );
    }
    if (heading.depth > thresholds.article.maxHeadingDepth) {
      findings.push(
        warn(
          'markdown.heading.deep',
          `Heading "${heading.text}" is h${heading.depth}; only h2 and h3 appear in the table of contents.`,
          { location: { heading: heading.text }, fixHint: 'Promote it to h3, or fold it into the section above.' },
        ),
      );
    }
  }

  const sectionHeadings = headings.filter((heading) => heading.depth === 2 || heading.depth === 3);
  if (sectionHeadings.length < thresholds.article.minHeadings) {
    findings.push(
      warn(
        'markdown.headings.few',
        `Only ${sectionHeadings.length} section heading(s); the table of contents needs at least ${thresholds.article.minHeadings} to be useful.`,
        { fixHint: 'Break the article into clearly-titled sections.' },
      ),
    );
  }

  // Skipped levels (h2 → h4) break the document outline for screen readers.
  let previousDepth = 1;
  for (const heading of headings) {
    if (heading.depth > previousDepth + 1) {
      findings.push(
        warn(
          'markdown.heading.skip',
          `Heading "${heading.text}" jumps from h${previousDepth} to h${heading.depth}.`,
          { location: { heading: heading.text }, fixHint: 'Do not skip heading levels - it breaks the outline for screen readers.' },
        ),
      );
    }
    previousDepth = heading.depth;
  }

  // Duplicate heading text still works (blogUtils.js appends -2 to the id)
  // but produces a table of contents with two identical-looking entries.
  const seen = new Map();
  for (const heading of sectionHeadings) {
    const key = slugifyHeading(heading.text);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      findings.push(
        warn('markdown.heading.duplicate', `${count} headings share the text "${key}".`, {
          fixHint: 'Give each section a distinct title so the table of contents is unambiguous.',
        }),
      );
    }
  }

  // --- Anchor links -----------------------------------------------------

  const headingIds = new Set(sectionHeadings.map((heading) => slugifyHeading(heading.text)));
  const anchorRe = /\[[^\]]*\]\(#([^)]+)\)/g;
  let anchorMatch;
  while ((anchorMatch = anchorRe.exec(body)) !== null) {
    if (!headingIds.has(anchorMatch[1])) {
      findings.push(
        error('markdown.anchor.unknown', `Link to "#${anchorMatch[1]}" matches no heading in this article.`, {
          location: { excerpt: anchorMatch[0] },
          fixHint: 'Anchor ids are the heading text lowercased with spaces replaced by hyphens.',
        }),
      );
    }
  }

  // --- Code blocks ------------------------------------------------------

  for (const block of code) {
    if (!block.lang) {
      findings.push(
        warn('markdown.code.nolang', 'Code block has no language tag, so it gets no syntax highlighting.', {
          location: { excerpt: block.text.slice(0, 60) },
          fixHint: 'Tag the fence, e.g. ```js, ```json, ```bash. Use ```text for plain output.',
        }),
      );
    }
  }

  // --- Images -----------------------------------------------------------

  for (const image of images) {
    if (!image.text || image.text.trim() === '') {
      findings.push(
        error('markdown.image.alt', `Image "${image.href}" has no alt text.`, {
          location: { excerpt: image.href },
          fixHint: 'Add alt text describing the image, or use empty alt ("") only if it is purely decorative.',
        }),
      );
    }
  }

  // --- Length -----------------------------------------------------------

  const wordCount = countWords(stripMarkdown(body));

  if (wordCount < thresholds.article.minWords) {
    findings.push(
      error('markdown.length.short', `Article is ${wordCount} words; minimum is ${thresholds.article.minWords}.`, {
        fixHint: 'Too thin to rank or to be genuinely useful. Expand it, or fold it into a related article.',
      }),
    );
  } else if (wordCount > thresholds.article.maxWords) {
    findings.push(
      error('markdown.length.long', `Article is ${wordCount} words; maximum is ${thresholds.article.maxWords}.`, {
        fixHint: 'Split it into several focused articles that link to each other.',
      }),
    );
  } else if (wordCount < thresholds.article.idealMinWords || wordCount > thresholds.article.idealMaxWords) {
    findings.push(
      warn(
        'markdown.length.band',
        `Article is ${wordCount} words; the usual range is ${thresholds.article.idealMinWords}-${thresholds.article.idealMaxWords}.`,
      ),
    );
  }

  return buildVerdict(id, findings, { meta: { wordCount, headings: headings.length, codeBlocks: code.length } });
}
