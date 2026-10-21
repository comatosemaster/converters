// -----------------------------------------------------------------------
// CASE CONVERSION LOGIC - no React.
//
// Two families of cases behave differently on purpose:
//   - Writing cases (UPPER, lower, Title, Sentence...) change only the
//     letters and keep every space, line break and punctuation mark where
//     it was. The basic ones are shared with the Word Counter tool
//     (convertCase in textAnalysis.js), so both tools always agree.
//   - Programming cases (camelCase, snake_case...) rebuild text from its
//     words, so punctuation and spacing are replaced by the case's own
//     separator. They work line by line, which makes it easy to convert a
//     whole list of names at once.
// -----------------------------------------------------------------------

import { capitalizeLetter, convertCase } from '../word-counter-text-analyzer/textAnalysis.js';

// Short words that stay lowercase inside a headline (unless first or last),
// following the common AP / Chicago style rule of thumb.
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'off',
  'on', 'onto', 'or', 'over', 'per', 'so', 'than', 'the', 'to', 'up', 'via', 'vs', 'with', 'yet',
]);

function headlineCase(text) {
  return text
    .split('\n')
    .map((line) => {
      const words = [...line.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu)];
      // A line typed entirely in capitals is being converted FROM caps, so
      // nothing in it counts as a deliberate acronym.
      const allCaps = !/\p{Ll}/u.test(line);
      let out = '';
      let last = 0;
      words.forEach((match, i) => {
        const word = match[0];
        const lower = word.toLowerCase();
        const isEdge = i === 0 || i === words.length - 1;
        // Words with a capital after the first letter ("NASA", "iPhone",
        // "McDonald") were capitalized on purpose - leave them as typed.
        const keep = !allCaps && /\p{Lu}/u.test(word.slice(1));
        const cased = keep
          ? word
          : !isEdge && MINOR_WORDS.has(lower)
            ? lower
            : capitalizeLetter(lower.charAt(0)) + lower.slice(1);
        out += line.slice(last, match.index) + cased;
        last = match.index + word.length;
      });
      return out + line.slice(last);
    })
    .join('\n');
}

function alternatingCase(text) {
  let upper = false;
  return text.replace(/\p{L}/gu, (char) => {
    upper = !upper;
    return upper ? char.toLowerCase() : char.toUpperCase();
  });
}

// Splits an identifier or phrase into words: on anything that isn't a
// letter or digit, and on case changes inside a word, so "XMLHttpRequest"
// becomes XML / Http / Request and "version2Beta" becomes version2 / Beta.
export function splitWords(line) {
  return (
    line
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2') // fooBar -> foo Bar, v2Beta -> v2 Beta
      .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2') // XMLHttp -> XML Http
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

const capitalize = (word) => capitalizeLetter(word.charAt(0)) + word.slice(1).toLowerCase();

function perLine(text, joinWords) {
  return text
    .split('\n')
    .map((line) => {
      const words = splitWords(line);
      return words.length ? joinWords(words) : '';
    })
    .join('\n');
}

export const CASES = [
  { id: 'upper', label: 'UPPERCASE', group: 'writing', convert: (t) => convertCase(t, 'upper') },
  { id: 'lower', label: 'lowercase', group: 'writing', convert: (t) => convertCase(t, 'lower') },
  { id: 'title', label: 'Title Case', group: 'writing', convert: headlineCase, hint: 'Headline style - small words like "of" and "the" stay lowercase' },
  { id: 'capitalized', label: 'Capitalize Each Word', group: 'writing', convert: (t) => convertCase(t, 'title') },
  { id: 'sentence', label: 'Sentence case', group: 'writing', convert: (t) => convertCase(t, 'sentence') },
  { id: 'toggle', label: 'tOGGLE cASE', group: 'writing', convert: (t) => convertCase(t, 'toggle') },
  { id: 'alternating', label: 'aLtErNaTiNg CaSe', group: 'writing', convert: alternatingCase },
  { id: 'camel', label: 'camelCase', group: 'code', convert: (t) => perLine(t, (w) => w[0].toLowerCase() + w.slice(1).map(capitalize).join('')) },
  { id: 'pascal', label: 'PascalCase', group: 'code', convert: (t) => perLine(t, (w) => w.map(capitalize).join('')) },
  { id: 'snake', label: 'snake_case', group: 'code', convert: (t) => perLine(t, (w) => w.map((x) => x.toLowerCase()).join('_')) },
  { id: 'constant', label: 'CONSTANT_CASE', group: 'code', convert: (t) => perLine(t, (w) => w.map((x) => x.toUpperCase()).join('_')) },
  { id: 'kebab', label: 'kebab-case', group: 'code', convert: (t) => perLine(t, (w) => w.map((x) => x.toLowerCase()).join('-')) },
  { id: 'train', label: 'Train-Case', group: 'code', convert: (t) => perLine(t, (w) => w.map(capitalize).join('-')) },
  { id: 'dot', label: 'dot.case', group: 'code', convert: (t) => perLine(t, (w) => w.map((x) => x.toLowerCase()).join('.')) },
];

export const CASE_BY_ID = Object.fromEntries(CASES.map((c) => [c.id, c]));
