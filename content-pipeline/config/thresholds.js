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
    // For `seoTitle` on its own. The site appends " | NeatSize" (11
    // characters) to make the page's <title>, and the build rejects any
    // <title> over 60 - so 49 here is what keeps the full title within 60.
    titleMax: 49,
    titleMin: 20,
    metaDescriptionMin: 120,
    // Matches the site build's limit (scripts/verify-prerender.js).
    metaDescriptionMax: 155,
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
