// -----------------------------------------------------------------------
// TEXT ANALYSIS LOGIC — no React, no DOM (aside from the tiny File-reading
// helper). Kept separate from WordCounterTextAnalyzer.jsx so the analysis
// itself can be read (or reused) independently of the UI.
// -----------------------------------------------------------------------

// Normalizes Windows (\r\n) and old Mac (\r) line endings to \n, so every
// line/paragraph-counting function below only has to think about one kind
// of line break.
export function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Counts user-perceived characters rather than JS's raw UTF-16 length, so
// a single emoji counts as one character even when it's stored as
// multiple code units. Intl.Segmenter (grapheme mode) is the correct tool
// for this and is broadly supported in current browsers; code-point
// iteration is used as a fallback if it's ever missing.
export function countCharacters(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
  }
  return [...text].length;
}

function stripPunctuation(word) {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function getWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

// --- Basic statistics -----------------------------------------------------------

export function calculateStatistics(text) {
  const normalized = normalizeLineEndings(text);
  const wordList = getWords(normalized);

  // Sentence splitting is a heuristic (it doesn't know "Mr." isn't a
  // sentence end) — good enough for an estimate, not true NLP.
  const sentenceList = normalized
    .split(/[.!?]+(?:\s|$)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const paragraphList = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    words: wordList.length,
    charsWithSpaces: countCharacters(normalized),
    charsWithoutSpaces: countCharacters(normalized.replace(/\s/g, '')),
    sentences: sentenceList.length,
    paragraphs: paragraphList.length,
    lines: normalized === '' ? 0 : normalized.split('\n').length,
    wordList,
    sentenceList,
    paragraphList,
  };
}

// --- Reading / speaking time ------------------------------------------------------

const READING_WORDS_PER_MINUTE = 200; // a commonly-cited average adult silent-reading speed
const SPEAKING_WORDS_PER_MINUTE = 130; // a commonly-cited average speaking pace

function formatDuration(minutes) {
  const totalSeconds = Math.round(minutes * 60);
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  const wholeMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${wholeMinutes} min` : `${wholeMinutes} min ${seconds} sec`;
}

export function calculateReadingTime(wordCount) {
  return formatDuration(wordCount / READING_WORDS_PER_MINUTE);
}

export function calculateSpeakingTime(wordCount) {
  return formatDuration(wordCount / SPEAKING_WORDS_PER_MINUTE);
}

// --- Word-level statistics --------------------------------------------------------

export function calculateWordStats(wordList) {
  const cleaned = wordList.map(stripPunctuation).filter(Boolean);

  if (cleaned.length === 0) {
    return { longestWord: '', shortestWord: '', uniqueWords: 0, repeatedWords: 0, vocabularyRichness: 0 };
  }

  const longestWord = cleaned.reduce((longest, word) => (word.length > longest.length ? word : longest), '');
  const shortestWord = cleaned.reduce((shortest, word) => (word.length < shortest.length ? word : shortest), cleaned[0]);

  const frequency = new Map();
  cleaned.forEach((word) => {
    const key = word.toLowerCase();
    frequency.set(key, (frequency.get(key) || 0) + 1);
  });

  const uniqueWords = frequency.size;
  const repeatedWords = [...frequency.values()].filter((count) => count > 1).length;
  const vocabularyRichness = (uniqueWords / cleaned.length) * 100;

  return { longestWord, shortestWord, uniqueWords, repeatedWords, vocabularyRichness };
}

// --- Character breakdown -----------------------------------------------------------

// The four named buckets are counted directly by Unicode category; "special"
// is whatever's left over (emoji, symbols, control characters, ...) — a
// residual bucket rather than its own regex, so the parts always add up to
// the whole instead of risking double-counting or gaps.
export function calculateCharacterBreakdown(text) {
  const total = countCharacters(text);
  const letters = (text.match(/\p{L}/gu) || []).length;
  const numbers = (text.match(/\p{N}/gu) || []).length;
  const spaces = (text.match(/\s/g) || []).length;
  const punctuation = (text.match(/\p{P}/gu) || []).length;
  const special = Math.max(0, total - letters - numbers - spaces - punctuation);
  return { total, letters, numbers, spaces, punctuation, special };
}

// --- Keyword analysis ---------------------------------------------------------------

// A small list of very common English words that would otherwise dominate
// any "top words" list without saying much about the text's actual
// content.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'because', 'as', 'of', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
  'again', 'further', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'having', 'do', 'does', 'did', 'doing', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this',
  'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him',
  'us', 'them', 'not', 'no', 'can', 'will', 'just', 'should', 'now',
]);

export function calculateKeywordDensity(wordList, { ignoreStopWords = true } = {}) {
  const cleaned = wordList.map((word) => stripPunctuation(word).toLowerCase()).filter(Boolean);
  const total = cleaned.length;
  const relevant = ignoreStopWords ? cleaned.filter((word) => !STOP_WORDS.has(word)) : cleaned;

  const frequency = new Map();
  relevant.forEach((word) => frequency.set(word, (frequency.get(word) || 0) + 1));

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count, percent: total ? (count / total) * 100 : 0 }));
}

// --- Search ------------------------------------------------------------------------

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchOccurrences(text, query, { matchCase = false, wholeWord = false } = {}) {
  if (!query) return 0;
  const escaped = escapeRegExp(query);
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const regex = new RegExp(pattern, matchCase ? 'g' : 'gi');
  return (text.match(regex) || []).length;
}

// --- Case conversion -----------------------------------------------------------------
//
// Every mode below transforms only the letters themselves and leaves all
// original whitespace/punctuation exactly where it was — none of these
// split the text into words and rejoin it, which would otherwise silently
// collapse things like double spaces or blank lines.

export function convertCase(text, mode) {
  switch (mode) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      // Matches each run of letters (ignoring surrounding punctuation, so
      // "(hello)" becomes "(Hello)" rather than being left alone).
      return text.replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    case 'sentence': {
      const lower = text.toLowerCase();
      // Capitalizes the first letter of the text, and the first letter
      // after any . ! or ? followed by whitespace.
      return lower.replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (match) => match.toUpperCase());
    }
    case 'toggle':
      return text.replace(/\p{L}/gu, (char) => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()));
    default:
      return text;
  }
}

// --- Cleanup utilities -----------------------------------------------------------------

export function cleanText(text, operation) {
  const normalized = normalizeLineEndings(text);
  const lines = normalized.split('\n');

  switch (operation) {
    case 'remove-extra-spaces':
      return normalized.replace(/[ \t]+/g, ' ');
    case 'remove-blank-lines':
      return lines.filter((line) => line.trim() !== '').join('\n');
    case 'remove-duplicate-lines': {
      const seen = new Set();
      return lines.filter((line) => (seen.has(line) ? false : (seen.add(line), true))).join('\n');
    }
    case 'trim-whitespace':
      return normalized.trim();
    case 'sort-asc':
      return [...lines].sort((a, b) => a.localeCompare(b)).join('\n');
    case 'sort-desc':
      return [...lines].sort((a, b) => b.localeCompare(a)).join('\n');
    case 'reverse-lines':
      return [...lines].reverse().join('\n');
    default:
      return normalized;
  }
}

// --- Readability ------------------------------------------------------------------------

// A standard simplified syllable-count heuristic (count vowel groups, drop
// a trailing silent "e") — not true phonetic analysis, but the same
// approach virtually every readability tool online uses. English-only, in
// keeping with the Flesch formulas themselves being English-specific.
function countSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  let count = (clean.match(/[aeiouy]+/g) || []).length;
  if (clean.endsWith('e') && !clean.endsWith('le')) count -= 1;
  return Math.max(1, count);
}

const FLESCH_SCORE_LABELS = [
  { min: 90, label: 'Very easy' },
  { min: 80, label: 'Easy' },
  { min: 70, label: 'Fairly easy' },
  { min: 60, label: 'Standard' },
  { min: 50, label: 'Fairly difficult' },
  { min: 30, label: 'Difficult' },
  { min: -Infinity, label: 'Very difficult' },
];

function describeFleschScore(score) {
  return FLESCH_SCORE_LABELS.find((level) => score >= level.min).label;
}

// Returns null when there's not enough text to meaningfully score (no
// words or no complete sentences) rather than dividing by zero.
export function calculateReadability(wordList, sentenceCount) {
  if (wordList.length === 0 || sentenceCount === 0) return null;

  const totalSyllables = wordList.reduce((sum, word) => sum + countSyllables(word), 0);
  const wordsPerSentence = wordList.length / sentenceCount;
  const syllablesPerWord = totalSyllables / wordList.length;

  const fleschReadingEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const fleschKincaidGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;

  return {
    fleschReadingEase,
    fleschReadingEaseLabel: describeFleschScore(fleschReadingEase),
    fleschKincaidGrade,
  };
}

// --- File loading ------------------------------------------------------------------------

// A generous ceiling for uploaded .txt files — large enough for any
// realistic document, small enough that analyzing it on every keystroke
// (this tool re-analyzes live, with no debounce) stays responsive.
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function validateTextFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `That file is too large to load safely (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).`,
    };
  }
  const looksLikeText = file.type === '' || file.type.startsWith('text/') || /\.txt$/i.test(file.name);
  if (!looksLikeText) {
    return { ok: false, error: 'Please choose a .txt file.' };
  }
  return { ok: true, error: '' };
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}
