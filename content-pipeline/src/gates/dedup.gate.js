// -----------------------------------------------------------------------
// GATE: dedup  (Tier 1 - deterministic, free)
//
// Autonomous content systems rediscover their own topics with total
// reliability: given the same tool inventory and the same prompt, a topic
// scout proposes "What Is Base64?" again six weeks later, and nothing in
// a per-article pipeline notices. The result is two near-identical pages
// competing with each other in search - the site's own content cannibalising
// its own rankings.
//
// This is the guard. Jaccard similarity over word shingles: no model, no
// embeddings service, and well-suited to exactly this question, which is
// about overlapping phrasing rather than subtle semantic nuance.
//
// This gate can REJECT rather than ask for revision - a duplicate isn't a
// fixable draft, it's an article that shouldn't exist.
// -----------------------------------------------------------------------

import { buildVerdict, error, warn } from '../util/verdict.js';
import { jaccard, shingles, stripMarkdown } from '../util/text.js';
import { thresholds } from '../../config/thresholds.js';

export const id = 'dedup';
export const tier = 1;

function titleSimilarity(a = '', b = '') {
  const normalize = (text) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((word) => word.length > 2),
    );
  return jaccard(normalize(a), normalize(b));
}

export async function run({ frontmatter, body, corpus }) {
  const findings = [];

  if (corpus.articles.length === 0) {
    return buildVerdict(id, [], { score: 100, threshold: 100 });
  }

  const candidate = shingles(stripMarkdown(body), thresholds.dedup.shingleSize);

  let worst = { slug: null, similarity: 0 };
  for (const other of corpus.fingerprints) {
    const similarity = jaccard(candidate, other.shingles);
    if (similarity > worst.similarity) worst = { slug: other.slug, similarity, title: other.title };
  }

  const percent = Math.round(worst.similarity * 100);

  if (worst.similarity >= thresholds.dedup.reject) {
    findings.push(
      error(
        'dedup.body.duplicate',
        `Body is ${percent}% similar to the existing article "${worst.slug}".`,
        {
          location: { field: 'body' },
          fixHint: `This is effectively a rewrite of /blog/${worst.slug}. Update that article instead of publishing a second one.`,
        },
      ),
    );
  } else if (worst.similarity >= thresholds.dedup.warn) {
    findings.push(
      warn('dedup.body.similar', `Body is ${percent}% similar to "${worst.slug}".`, {
        fixHint: `Make sure this covers genuinely different ground, and link the two together rather than competing with /blog/${worst.slug}.`,
      }),
    );
  }

  // Titles are checked separately: two articles can share a title while
  // saying different things, and that alone splits search intent between
  // them.
  for (const other of corpus.articles) {
    const similarity = titleSimilarity(frontmatter.title, other.frontmatter.title);
    if (similarity >= 0.8) {
      findings.push(
        warn(
          'dedup.title.similar',
          `Title is very close to "${other.frontmatter.title}" (/blog/${other.slug}).`,
          { location: { field: 'title' }, fixHint: 'Differentiate the titles so the two pages target distinct queries.' },
        ),
      );
      break;
    }
  }

  return buildVerdict(id, findings, {
    score: Math.round((1 - worst.similarity) * 100),
    threshold: Math.round((1 - thresholds.dedup.reject) * 100),
    // A duplicate is not a revision request - iterating on it can't help.
    forceVerdict: worst.similarity >= thresholds.dedup.reject ? 'reject' : undefined,
    meta: { closestSlug: worst.slug, similarity: worst.similarity },
  });
}
