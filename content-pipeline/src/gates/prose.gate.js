// -----------------------------------------------------------------------
// GATE: prose  (Tier 1 - deterministic, free)
//
// This gate exists so that no LLM call is ever spent confirming that a
// language model wrote grammatical English. It didn't need checking, and
// paying frontier prices for a null result is the most common waste in
// pipelines like this one.
//
// What IS worth checking deterministically is the specific texture that
// makes machine-written content recognisable and unpleasant: hedging
// ("it's important to note that"), empty intensifiers, every paragraph
// opening the same way, and keyword repetition dense enough to read as
// stuffing.
//
// Everything here is a heuristic, so almost everything is a WARNING.
// Deterministic checks that produce false positives must never block
// publication - the one exception is keyword stuffing, which is an actual
// ranking risk rather than a matter of taste.
// -----------------------------------------------------------------------

import { buildVerdict, error, warn, info } from '../util/verdict.js';
import {
  contentWords,
  fleschReadingEase,
  sentences,
  stripMarkdown,
  wordDensity,
  words,
} from '../util/text.js';
import { thresholds } from '../../config/thresholds.js';

export const id = 'prose';
export const tier = 1;

// Filler that adds length without information. The LLM-written giveaways
// ("in today's digital landscape", "it's important to note") are here
// because they're the phrases readers have learned to read as noise.
const FILLER_PHRASES = [
  "in today's digital landscape",
  "in today's digital world",
  'in today’s digital age',
  'it is important to note that',
  "it's important to note that",
  'it is worth noting that',
  'needless to say',
  'at the end of the day',
  'when it comes to',
  'in order to',
  'due to the fact that',
  'the fact of the matter is',
  'last but not least',
  'in conclusion',
  'delve into',
  'navigate the world of',
  'unlock the power of',
  'in this article, we will',
  'without further ado',
];

// Vague qualifiers that weaken a claim without qualifying it usefully.
const WEASEL_WORDS = [
  'very',
  'really',
  'quite',
  'rather',
  'somewhat',
  'basically',
  'essentially',
  'actually',
  'literally',
  'simply',
  'just',
  'various',
  'numerous',
  'several',
];

export async function run({ body }) {
  const findings = [];
  const text = stripMarkdown(body);
  const sentenceList = sentences(text);
  const wordList = words(text);

  if (wordList.length === 0) {
    return buildVerdict(id, [error('prose.empty', 'Article body contains no prose.')]);
  }

  // --- Filler phrases ---------------------------------------------------

  const lowerText = text.toLowerCase();
  for (const phrase of FILLER_PHRASES) {
    const count = lowerText.split(phrase).length - 1;
    if (count > 0) {
      findings.push(
        warn('prose.filler', `Uses the filler phrase "${phrase}"${count > 1 ? ` ${count} times` : ''}.`, {
          fixHint: 'Cut it. These phrases add length without adding information.',
        }),
      );
    }
  }

  // --- Weasel words -----------------------------------------------------
  //
  // Reported in aggregate rather than one finding per occurrence: a single
  // "very" is fine, and forty findings would drown out real problems.

  const weaselCount = wordList.filter((word) => WEASEL_WORDS.includes(word)).length;
  const weaselRatio = weaselCount / wordList.length;
  if (weaselRatio > 0.015) {
    findings.push(
      warn(
        'prose.weasel',
        `${weaselCount} vague qualifiers ("very", "simply", "just"…) - ${(weaselRatio * 100).toFixed(1)}% of all words.`,
        { fixHint: 'Cut most of them. They soften claims without adding meaning.' },
      ),
    );
  }

  // --- Sentence length --------------------------------------------------

  const longSentences = sentenceList.filter(
    (sentence) => words(sentence).length > thresholds.prose.maxSentenceWords,
  );
  if (longSentences.length > 0) {
    const ratio = longSentences.length / sentenceList.length;
    if (ratio > thresholds.prose.longSentenceRatioWarn) {
      findings.push(
        warn(
          'prose.sentence.long',
          `${longSentences.length} of ${sentenceList.length} sentences exceed ${thresholds.prose.maxSentenceWords} words.`,
          {
            location: { excerpt: longSentences[0].slice(0, 100) },
            fixHint: 'Split the longest ones; they are hard to follow on a phone.',
          },
        ),
      );
    }
  }

  // --- Repetitive sentence openings -------------------------------------
  //
  // A reliable tell for machine-written prose, and genuinely monotonous
  // to read.

  let runLength = 1;
  let previousOpener = null;
  let worstRun = { opener: null, length: 1 };
  for (const sentence of sentenceList) {
    const opener = words(sentence)[0] ?? '';
    if (opener && opener === previousOpener) {
      runLength++;
      if (runLength > worstRun.length) worstRun = { opener, length: runLength };
    } else {
      runLength = 1;
    }
    previousOpener = opener;
  }
  if (worstRun.length > thresholds.prose.maxConsecutiveSentenceStartRepeat) {
    findings.push(
      warn(
        'prose.repetitive.openers',
        `${worstRun.length} consecutive sentences begin with "${worstRun.opener}".`,
        { fixHint: 'Vary the sentence openings; consecutive repeats read as machine-generated.' },
      ),
    );
  }

  // --- Keyword stuffing -------------------------------------------------
  //
  // The one hard failure in this gate: unlike the checks above, this is a
  // measurable ranking risk rather than a stylistic preference.

  const density = wordDensity(text);
  const top = density[0];
  if (top && top.density > thresholds.prose.maxSingleWordDensity && top.count > 8) {
    findings.push(
      error(
        'prose.keyword.stuffing',
        `The word "${top.word}" is ${(top.density * 100).toFixed(1)}% of all meaningful words (${top.count} times).`,
        {
          fixHint: 'Reads as keyword stuffing. Use pronouns and synonyms, or cut the repetitions.',
        },
      ),
    );
  }

  // --- Readability ------------------------------------------------------

  const readability = fleschReadingEase(text);
  if (readability < 30) {
    findings.push(
      warn('prose.readability.hard', `Flesch reading ease is ${readability} (very hard to read).`, {
        fixHint: 'Shorten sentences and prefer plain words - the audience is often skimming for an answer.',
      }),
    );
  }

  findings.push(
    info('prose.stats', `${wordList.length} words, ${sentenceList.length} sentences, readability ${readability}.`),
  );

  return buildVerdict(id, findings, {
    meta: {
      words: wordList.length,
      sentences: sentenceList.length,
      readability,
      uniqueContentWords: new Set(contentWords(text)).size,
    },
  });
}
