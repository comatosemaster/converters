// -----------------------------------------------------------------------
// QUALITY THRESHOLDS
//
// Separate from pipeline.config.js because these are the numbers most
// likely to be tuned in response to real output, and they should be
// adjustable without reading anything about pipeline mechanics.
//
// Rule of thumb used throughout: `error` blocks publication, `warn` is
// recorded and surfaced but does not. If a check can produce false
// positives on legitimate content, it must be a warning.
// -----------------------------------------------------------------------

export const thresholds = {
  article: {
    minWords: 500,
    maxWords: 4000,
    // Soft band - outside this is a warning, not a failure. Some topics
    // genuinely warrant 400 words and some warrant 3000.
    idealMinWords: 800,
    idealMaxWords: 2500,
    minHeadings: 2,
    maxHeadingDepth: 3,
  },

  seo: {
    titleMax: 60,
    titleMin: 20,
    metaDescriptionMin: 120,
    metaDescriptionMax: 160,
    // Below this, the article is an SEO dead end - it gives readers
    // nowhere to go and passes no internal link equity.
    minInternalLinks: 1,
    minRelatedTools: 1,
  },

  dedup: {
    // Jaccard similarity over word shingles. Above `reject`, we've almost
    // certainly rewritten an existing article; between the two, a human
    // should look.
    warn: 0.35,
    reject: 0.6,
    shingleSize: 5,
  },

  prose: {
    maxSentenceWords: 45,
    longSentenceRatioWarn: 0.15,
    maxConsecutiveSentenceStartRepeat: 3,
    // Keyword stuffing: no single non-trivial word should dominate.
    maxSingleWordDensity: 0.05,
  },
};

export default thresholds;
