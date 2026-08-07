// -----------------------------------------------------------------------
// GATE: links  (Tier 0 - deterministic, free)
//
// The highest-value gate in the system, and the reason the design rejects
// LLM-based fact checking as the primary defence.
//
// Most factual claims in these articles are claims about THIS site's own
// tools - "use the JSON Formatter", "try the UUID Generator". A model
// confidently referencing a tool that doesn't exist is far more likely
// than it misremembering what Base64 is, and unlike general knowledge it
// is checkable against src/tools/registry.js with total certainty, for
// free, in milliseconds.
//
// Every broken link caught here is a 404 that never reaches a reader.
// -----------------------------------------------------------------------

import { buildVerdict, error, warn } from '../util/verdict.js';
import { publicAssetExists } from '../adapters/site.js';
import { thresholds } from '../../config/thresholds.js';

export const id = 'links';
export const tier = 0;

// Markdown inline links: [text](target). Reference-style links are not
// used anywhere in this project's content and are not supported by the
// article template's conventions.
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function extractLinks(body) {
  const links = [];
  let match;
  while ((match = LINK_RE.exec(body)) !== null) {
    links.push(match[1]);
  }
  return links;
}

export async function run({ frontmatter, body, corpus }) {
  const findings = [];

  // --- Frontmatter references ------------------------------------------

  for (const toolId of frontmatter.relatedTools ?? []) {
    if (!corpus.toolIds.has(toolId)) {
      findings.push(
        error('links.tool.unknown', `relatedTools references "${toolId}", which is not a tool on this site.`, {
          location: { field: 'relatedTools' },
          fixHint: `Use a real tool id from src/tools/registry.js, or remove it. Available ids include: ${[...corpus.toolIds].slice(0, 8).join(', ')}…`,
        }),
      );
    }
  }

  for (const articleSlug of frontmatter.relatedArticles ?? []) {
    if (!corpus.slugs.has(articleSlug)) {
      findings.push(
        error(
          'links.article.unknown',
          `relatedArticles references "${articleSlug}", which is not a published article.`,
          {
            location: { field: 'relatedArticles' },
            fixHint: 'Remove it, or publish that article first. Same-category articles are suggested automatically, so this field is optional.',
          },
        ),
      );
    }
  }

  if (frontmatter.coverImage && !(await publicAssetExists(frontmatter.coverImage))) {
    findings.push(
      error('links.cover.missing', `coverImage "${frontmatter.coverImage}" does not exist in public/.`, {
        location: { field: 'coverImage' },
        fixHint: 'Add the image to public/, or drop the field - article cards fall back to a generated placeholder.',
      }),
    );
  }

  // --- Body links -------------------------------------------------------

  const links = extractLinks(body);
  let internalCount = 0;

  for (const target of links) {
    // Anchors and external links are out of scope: anchors are validated
    // by the markdown gate against real heading ids, and checking external
    // URLs would mean network calls in a gate that must stay instant.
    if (target.startsWith('#') || /^[a-z]+:/i.test(target) || target.startsWith('//')) continue;

    if (!target.startsWith('/')) {
      findings.push(
        warn('links.relative', `Link "${target}" is relative; site-absolute paths are more reliable.`, {
          fixHint: 'Start internal links with "/", e.g. /tool/base64-encoder-decoder.',
        }),
      );
      continue;
    }

    internalCount++;
    const [pathname] = target.split('#');

    const toolMatch = pathname.match(/^\/tool\/([^/]+)\/?$/);
    if (toolMatch) {
      if (!corpus.toolIds.has(toolMatch[1])) {
        findings.push(
          error('links.body.tool.unknown', `Body links to /tool/${toolMatch[1]}, which does not exist.`, {
            location: { excerpt: target },
            fixHint: 'Link to a real tool id from src/tools/registry.js, or remove the link.',
          }),
        );
      }
      continue;
    }

    const blogMatch = pathname.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch && blogMatch[1] !== 'category') {
      if (!corpus.slugs.has(blogMatch[1])) {
        findings.push(
          error('links.body.article.unknown', `Body links to /blog/${blogMatch[1]}, which is not published.`, {
            location: { excerpt: target },
            fixHint: 'Link to an existing article, or remove the link.',
          }),
        );
      }
      continue;
    }

    const categoryMatch = pathname.match(/^\/(?:blog\/)?category\/([^/]+)\/?$/);
    if (categoryMatch && !corpus.categoryIds.has(categoryMatch[1])) {
      findings.push(
        error('links.body.category.unknown', `Body links to category "${categoryMatch[1]}", which does not exist.`, {
          location: { excerpt: target },
          fixHint: `Use one of: ${[...corpus.categoryIds].join(', ')}.`,
        }),
      );
    }
  }

  // --- Internal linking health -----------------------------------------
  //
  // An article with no outbound internal links is an SEO dead end: it
  // gives the reader nowhere to go and passes no link equity to the tools
  // the article exists to promote.

  if (internalCount < thresholds.seo.minInternalLinks) {
    findings.push(
      warn('links.internal.none', 'Article contains no internal links.', {
        fixHint: 'Link to at least one relevant tool page, e.g. /tool/json-formatter-validator.',
      }),
    );
  }

  if ((frontmatter.relatedTools ?? []).length < thresholds.seo.minRelatedTools) {
    findings.push(
      warn('links.relatedTools.none', 'No relatedTools set.', {
        location: { field: 'relatedTools' },
        fixHint: 'List the tools this article is about - this is also what makes the article appear on those tool pages.',
      }),
    );
  }

  return buildVerdict(id, findings);
}
