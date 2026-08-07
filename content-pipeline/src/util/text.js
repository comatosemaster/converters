// -----------------------------------------------------------------------
// TEXT ANALYSIS PRIMITIVES
//
// Small, focused, dependency-free helpers shared by the prose and dedup
// gates. Hand-rolled rather than pulling in the retext/unified ecosystem
// (five-plus packages) for a handful of measurements - which also matches
// how the rest of this repo handles small text problems (see
// jsonHighlight.js, sqlHighlight.js).
//
// These are heuristics, not linguistics. Everything built on them is
// reported as a warning unless it's unambiguous.
// -----------------------------------------------------------------------

const WORD_RE = /[a-z0-9]+(?:'[a-z]+)?/gi;

// Words too common to be meaningful in similarity or density checks.
const STOP_WORDS = new Set(
  `a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its
   may might more most no not of on or our out she should so some such than that the their them then there these they
   this those to too up us was we were what when where which who why will with would you your`.split(/\s+/),
);

export function stripMarkdown(markdown) {
  return (
    markdown
      // Fenced code blocks: their contents are not prose and would skew
      // every measurement built on top of this.
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      // Images before links - an image is a link with a leading "!", so
      // doing links first would leave a stray "!" behind.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/[*_~]/g, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function words(text) {
  return text.match(WORD_RE)?.map((word) => word.toLowerCase()) ?? [];
}

export function countWords(text) {
  return words(text).length;
}

// Splits on sentence-ending punctuation followed by whitespace. Naive
// around abbreviations ("e.g."), which is acceptable because the only
// consumer is a long-sentence warning.
export function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function contentWords(text) {
  return words(text).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/** Relative frequency of each meaningful word - used for keyword-stuffing detection. */
export function wordDensity(text) {
  const list = contentWords(text);
  const counts = new Map();
  for (const word of list) counts.set(word, (counts.get(word) ?? 0) + 1);

  const total = list.length || 1;
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count, density: count / total }))
    .sort((a, b) => b.density - a.density);
}

// --- Similarity -----------------------------------------------------------
//
// Jaccard similarity over word shingles (n-grams). Cheap, needs no model,
// and is good at exactly the thing we care about: catching that we've
// rewritten an article we already published. Autonomous systems
// rediscover their own topics reliably, so this is a load-bearing check
// rather than a nicety.

export function shingles(text, size = 5) {
  const list = contentWords(text);
  if (list.length < size) return new Set(list.length ? [list.join(' ')] : []);

  const set = new Set();
  for (let i = 0; i <= list.length - size; i++) {
    set.add(list.slice(i, i + size).join(' '));
  }
  return set;
}

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  // Iterate the smaller set - the work is proportional to it, and the
  // result is symmetric either way.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of small) if (large.has(value)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

// --- Readability ----------------------------------------------------------

function countSyllables(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned.length <= 3) return 1;
  const groups = cleaned
    .replace(/(?:es|ed|[^laeiouy]e)$/, '')
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch Reading Ease. ~60-70 is plain English; higher is simpler. */
export function fleschReadingEase(text) {
  const sentenceList = sentences(text);
  const wordList = words(text);
  if (sentenceList.length === 0 || wordList.length === 0) return 0;

  const syllables = wordList.reduce((sum, word) => sum + countSyllables(word), 0);
  const wordsPerSentence = wordList.length / sentenceList.length;
  const syllablesPerWord = syllables / wordList.length;

  return Math.round((206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord) * 10) / 10;
}
