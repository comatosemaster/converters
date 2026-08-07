// -----------------------------------------------------------------------
// CORPUS
//
// An in-memory view of everything already published, plus the tool
// registry. Gates use it to answer questions that need whole-site
// knowledge: does this slug already exist, does this tool id resolve,
// is this article a near-duplicate of one we ran last month.
//
// Loaded once per process and passed to gates as context, so a run
// doesn't re-read and re-parse the corpus once per gate.
// -----------------------------------------------------------------------

import { readAllArticles, readRegistry } from '../adapters/site.js';
import { shingles, stripMarkdown } from '../util/text.js';
import { thresholds } from '../../config/thresholds.js';

export async function loadCorpus({ excludeSlug } = {}) {
  const [articles, registry] = await Promise.all([readAllArticles(), readRegistry()]);

  // Excluding the article under review matters when re-validating
  // something already staged - otherwise the dedup gate compares it to
  // itself and reports a perfect duplicate.
  const others = excludeSlug ? articles.filter((article) => article.slug !== excludeSlug) : articles;

  return {
    articles: others,
    slugs: new Set(others.map((article) => article.slug)),
    tools: registry.tools,
    toolIds: registry.toolIds,
    categories: registry.categories,
    categoryIds: registry.categoryIds,

    // Computed lazily: the dedup gate is the only consumer, and shingling
    // the whole corpus is wasted work for every other gate.
    get fingerprints() {
      if (!this._fingerprints) {
        this._fingerprints = others.map((article) => ({
          slug: article.slug,
          title: article.frontmatter.title,
          shingles: shingles(stripMarkdown(article.body), thresholds.dedup.shingleSize),
        }));
      }
      return this._fingerprints;
    },
  };
}
