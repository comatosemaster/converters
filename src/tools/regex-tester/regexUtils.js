// -----------------------------------------------------------------------
// REGEX LOGIC - no React, no DOM (aside from the tiny File-reading
// helper). Kept separate from RegexTester.jsx so parsing, matching, and
// explaining a pattern can be read (or reused) independently of the UI.
//
// Everything here runs on the browser's own native RegExp engine - there
// is no regex-parsing dependency. explainRegex() is a best-effort, hand-
// written breakdown of common syntax, not a full formal grammar: it's
// meant to be a helpful guide for the constructs on the cheat sheet, not
// a guarantee of perfect coverage for every possible pattern.
// -----------------------------------------------------------------------

// --- Turning user input into a { source, flags } pair -----------------------

// Recognizes the familiar /pattern/flags literal form and strips the
// delimiters, leaving just the source text new RegExp() expects. A plain
// pattern with no slashes (e.g. "abc") is used exactly as typed. Only
// whitespace OUTSIDE the delimiters is trimmed - whitespace INSIDE the
// pattern is preserved exactly, since it can be meaningful (e.g. matching
// literal spaces). The trailing flags are reported separately rather than
// applied automatically, so the flag checkboxes stay the single source of
// truth; RegexTester.jsx uses them as a one-time convenience to pre-check
// the matching boxes when a delimited pattern is pasted in.
const DELIMITED_PATTERN = /^\/([\s\S]+)\/([a-z]*)$/;

export function parseRegex(input) {
  if (!input) return { source: '', delimiterFlags: '' };
  const trimmed = input.trim();
  const match = trimmed.match(DELIMITED_PATTERN);
  if (match) return { source: match[1], delimiterFlags: match[2] };
  return { source: input, delimiterFlags: '' };
}

// --- Validating & compiling ---------------------------------------------------

// Never throws - compiles the pattern and reports either the working
// RegExp object or the engine's own (usually quite specific) error
// message, which covers bad syntax, unsupported flag combinations, and
// anything else the RegExp constructor can reject.
export function validateRegex(source, flags) {
  if (!source) {
    return { ok: false, error: 'Enter a regular expression to get started.', regex: null };
  }
  try {
    return { ok: true, error: '', regex: new RegExp(source, flags) };
  } catch (error) {
    return { ok: false, error: error.message, regex: null };
  }
}

// --- Running it against text ----------------------------------------------------

// A generous but real ceiling - protects the tab from a runaway zero-
// width-match loop or a pattern that legitimately matches an enormous
// number of times against a huge pasted document.
const MAX_MATCHES = 20000;

function toMatchInfo(match) {
  return {
    index: match.index,
    value: match[0],
    length: match[0].length,
    groups: match.slice(1),
    namedGroups: match.groups ? { ...match.groups } : null,
  };
}

// Only the "g" (global) and "y" (sticky) flags make regex.exec() advance
// on repeated calls - without one of those, exec() always returns the
// same first match, so a single test is all a plain pattern can ever
// produce. This mirrors real RegExp semantics rather than forcing global
// matching behind the scenes, so what you see here always matches what
// the same pattern would do in actual code.
export function executeRegex(regex, text) {
  if (!regex || !text) return [];

  if (!regex.global && !regex.sticky) {
    const match = regex.exec(text);
    return match ? [toMatchInfo(match)] : [];
  }

  const matches = [];
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match !== null && matches.length < MAX_MATCHES) {
    matches.push(toMatchInfo(match));
    if (match[0].length === 0) {
      // A zero-length match (e.g. from a pure lookaround) wouldn't
      // otherwise advance lastIndex, which would loop forever.
      regex.lastIndex += 1;
    }
    match = regex.exec(text);
  }
  return matches;
}

// --- Highlighting matches inside the test text ---------------------------------

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wraps every match in a <mark>, and the currently-selected one in an
// extra class - every character of `text` still appears exactly once in
// the output (matches themselves, plus the plain text between them), so
// this stays perfectly aligned with the real textarea underneath it. See
// the "Editor overlay" comment in RegexTester.jsx for why that matters.
export function highlightMatches(text, matches, currentIndex) {
  if (matches.length === 0) return escapeHtml(text);

  let html = '';
  let cursor = 0;

  matches.forEach((match, i) => {
    if (match.index > cursor) {
      html += escapeHtml(text.slice(cursor, match.index));
    }
    const value = text.slice(match.index, match.index + match.length);
    const className = i === currentIndex ? 'regex-hl-match regex-hl-match-current' : 'regex-hl-match';
    html += `<mark class="${className}" data-match-index="${i}">${escapeHtml(value)}</mark>`;
    cursor = Math.max(cursor, match.index + match.length);
  });

  if (cursor < text.length) html += escapeHtml(text.slice(cursor));
  return html;
}

// --- Replacing --------------------------------------------------------------------

// text.replace() already understands $1, $2, $<name>, $&, $` and $' in
// the replacement string exactly as documented for String.prototype.replace
// - no need to hand-roll that substitution ourselves.
export function replaceMatches(regex, text, replacement) {
  try {
    return { ok: true, error: '', result: text.replace(regex, replacement) };
  } catch (error) {
    return { ok: false, error: error.message, result: '' };
  }
}

// --- Capture group count -----------------------------------------------------------

// Counts CAPTURING groups only - "(?:", "(?=", "(?!", "(?<=", "(?<!" are
// all non-capturing/lookaround and don't count, but a named group like
// "(?<year>" does. Character classes and escaped parentheses are skipped
// so a literal "\(" or a "(" inside [...] is never mistaken for a group.
export function countCaptureGroups(source) {
  let count = 0;
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') {
      i++; // skip the escaped character too
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') {
      inClass = true;
    } else if (char === '(') {
      const isLookaroundOrNonCapturing = source[i + 1] === '?' && !/^\(\?<[^=!]/.test(source.slice(i));
      if (!isLookaroundOrNonCapturing) count++;
    }
  }
  return count;
}

// --- Formatting matches for the "Copy Matches" button -----------------------------

export function formatMatchesAsText(matches) {
  if (matches.length === 0) return '';
  return matches
    .map((match, i) => {
      const groupsText = match.groups.length
        ? ` | groups: ${match.groups.map((group, gi) => `$${gi + 1}=${group === undefined ? '(none)' : JSON.stringify(group)}`).join(', ')}`
        : '';
      return `${i + 1}. [index ${match.index}] ${JSON.stringify(match.value)}${groupsText}`;
    })
    .join('\n');
}

// --- Human-readable explanation ----------------------------------------------------
//
// Best-effort, not a full regex grammar: walks the pattern left to right
// and produces a short phrase for each recognized piece, in the order it
// appears. Anything it doesn't specifically recognize (e.g. a Unicode
// property escape like \p{Letter}) is still described generically rather
// than skipped or thrown away, since a slightly vague explanation is far
// more useful than a missing one.

// Bare noun phrases with no leading article, so the same string reads
// naturally in both templates pushQuantified() builds: "Matches digits."
// on its own, and "Matches one or more digits." combined with a
// quantifier - which is also the exact phrasing the spec asks for.
const SHORTHAND_CLASSES = {
  d: 'digits (0-9)',
  D: 'characters that are NOT digits',
  w: 'word characters (letters, digits, or underscores)',
  W: 'characters that are NOT word characters',
  s: 'whitespace characters (spaces, tabs, or line breaks)',
  S: 'characters that are NOT whitespace',
};

const ESCAPE_DESCRIPTIONS = {
  n: 'line-feed characters (newlines)',
  r: 'carriage-return characters',
  t: 'tab characters',
  '0': 'NUL characters',
};

// Looks for a quantifier (*, +, ?, or {n,m}) starting exactly at `index`,
// including a trailing "?" that makes it lazy. Returns null if there
// isn't one there.
function describeQuantifier(source, index) {
  const char = source[index];
  let text = null;
  let length = 0;

  if (char === '*') {
    text = 'zero or more';
    length = 1;
  } else if (char === '+') {
    text = 'one or more';
    length = 1;
  } else if (char === '?') {
    text = 'zero or one (optional)';
    length = 1;
  } else if (char === '{') {
    const match = source.slice(index).match(/^\{(\d+)(,(\d*))?\}/);
    if (match) {
      const [full, min, commaGroup, max] = match;
      length = full.length;
      if (commaGroup === undefined) text = `exactly ${min}`;
      else if (max === '') text = `${min} or more`;
      else text = `between ${min} and ${max}`;
    }
  }

  if (text === null) return null;

  if (source[index + length] === '?') {
    length += 1;
    text += ' (as few as possible)';
  }
  return { text, length };
}

// openIndex points at "[". Returns the index of the matching "]" (or
// source.length if the class is left unterminated).
function findClassEnd(source, openIndex) {
  let i = openIndex + 1;
  if (source[i] === '^') i++; // negation
  if (source[i] === ']') i++; // a "]" right after "[" or "[^" is literal
  while (i < source.length && source[i] !== ']') {
    if (source[i] === '\\') i++;
    i++;
  }
  return i;
}

// openIndex points at "(". Returns the index of the matching ")",
// tracking nested groups and skipping over character classes/escapes so
// a "(" or ")" inside either of those is never mistaken for structure.
function findGroupEnd(source, openIndex) {
  let depth = 1;
  let i = openIndex + 1;
  while (i < source.length && depth > 0) {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '[') {
      i = findClassEnd(source, i) + 1;
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')') depth--;
    i++;
  }
  return i - 1;
}

function describeGroupOpener(source, openIndex) {
  const after = source.slice(openIndex);
  if (after.startsWith('(?:')) return { kind: 'non-capturing', openLength: 3 };
  if (after.startsWith('(?=')) return { kind: 'lookahead', openLength: 3 };
  if (after.startsWith('(?!')) return { kind: 'negative-lookahead', openLength: 3 };
  if (after.startsWith('(?<=')) return { kind: 'lookbehind', openLength: 4 };
  if (after.startsWith('(?<!')) return { kind: 'negative-lookbehind', openLength: 4 };
  const namedMatch = after.match(/^\(\?<([^>]+)>/);
  if (namedMatch) return { kind: 'named', name: namedMatch[1], openLength: namedMatch[0].length };
  return { kind: 'capturing', openLength: 1 };
}

// Pushes one explained "atom" (from source[from] to source[to], exclusive
// of any quantifier) onto `parts`, absorbing a trailing quantifier if one
// immediately follows. Returns the new cursor position.
function pushQuantified(parts, source, from, to, noun) {
  const quantifier = describeQuantifier(source, to);
  const end = quantifier ? to + quantifier.length : to;
  const description = quantifier ? `Matches ${quantifier.text} ${noun}.` : `Matches ${noun}.`;
  parts.push({ token: source.slice(from, end), description });
  return end;
}

// Characters that always need their own explicit handling. Everything
// else - including a bare "}"/"*" that doesn't happen to form a real
// quantifier, which JS treats as a literal character - falls through to
// the plain-literal-run branch below, so the walk can never get stuck.
const DISPATCH_CHARS = /[.^$|\\[(]/;

// Walks one sequence of the pattern (the whole thing, or the inside of a
// group/lookaround). `captureCounter` is a { current } box shared across
// the whole call tree so capturing groups are numbered left to right in
// the order they open, matching real backreference numbering.
function walkSequence(source, captureCounter) {
  const parts = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (char === '^') {
      parts.push({ token: '^', description: 'Anchors here to the start of the string (or line, with the m flag).' });
      i++;
    } else if (char === '$') {
      parts.push({ token: '$', description: 'Anchors here to the end of the string (or line, with the m flag).' });
      i++;
    } else if (char === '|') {
      parts.push({ token: '|', description: 'OR - matches this alternative, or the one(s) on the other side of the |.' });
      i++;
    } else if (char === '.') {
      i = pushQuantified(parts, source, i, i + 1, 'any character (except a line break, unless the s flag is on)');
    } else if (char === '\\') {
      const next = source[i + 1];
      if (next === undefined) {
        parts.push({ token: '\\', description: 'A trailing backslash - likely an incomplete escape sequence.' });
        i++;
      } else if (SHORTHAND_CLASSES[next]) {
        i = pushQuantified(parts, source, i, i + 2, SHORTHAND_CLASSES[next]);
      } else if (next === 'b') {
        parts.push({
          token: '\\b',
          description: 'A word boundary - the position between a word character and a non-word character (or the start/end of the string).',
        });
        i += 2;
      } else if (next === 'B') {
        parts.push({ token: '\\B', description: 'A position that is NOT a word boundary.' });
        i += 2;
      } else if (/[1-9]/.test(next)) {
        const match = source.slice(i).match(/^\\(\d+)/);
        parts.push({ token: match[0], description: `Backreference - matches the same text already captured by group ${match[1]}.` });
        i += match[0].length;
      } else if (next === 'k' && source[i + 2] === '<') {
        const match = source.slice(i).match(/^\\k<([^>]+)>/);
        if (match) {
          parts.push({ token: match[0], description: `Backreference - matches the same text already captured by the group named "${match[1]}".` });
          i += match[0].length;
        } else {
          parts.push({ token: '\\k', description: 'An incomplete named backreference.' });
          i += 2;
        }
      } else if (ESCAPE_DESCRIPTIONS[next]) {
        i = pushQuantified(parts, source, i, i + 2, ESCAPE_DESCRIPTIONS[next]);
      } else if (/[A-Za-z]/.test(next)) {
        i = pushQuantified(parts, source, i, i + 2, `special escape sequence \\${next}`);
      } else {
        // \. \* \+ etc - an escaped special character, now literal.
        i = pushQuantified(parts, source, i, i + 2, `the character "${next}"`);
      }
    } else if (char === '[') {
      const end = findClassEnd(source, i);
      const closeAt = Math.min(end, source.length - 1);
      const isNegated = source[i + 1] === '^';
      const inner = source.slice(isNegated ? i + 2 : i + 1, end);
      const noun = isNegated ? `characters NOT in "${inner}"` : `one character in "${inner}"`;
      i = pushQuantified(parts, source, i, closeAt + 1, noun);
    } else if (char === '(') {
      const opener = describeGroupOpener(source, i);
      const closeIndex = findGroupEnd(source, i);
      const innerSource = source.slice(i + opener.openLength, closeIndex);
      const innerParts = innerSource ? walkSequence(innerSource, captureCounter) : [];
      const innerSummary = innerParts.length ? innerParts.map((part) => part.description).join(' ') : '(empty)';
      const fullToken = source.slice(i, Math.min(closeIndex + 1, source.length));

      let label;
      if (opener.kind === 'capturing') {
        captureCounter.current += 1;
        label = `Group ${captureCounter.current} - captures:`;
      } else if (opener.kind === 'named') {
        captureCounter.current += 1;
        label = `Group ${captureCounter.current} (named "${opener.name}") - captures:`;
      } else if (opener.kind === 'non-capturing') {
        label = 'A group (not captured):';
      } else if (opener.kind === 'lookahead') {
        label = 'Only matches if followed by (not part of the match itself):';
      } else if (opener.kind === 'negative-lookahead') {
        label = 'Only matches if NOT followed by:';
      } else if (opener.kind === 'lookbehind') {
        label = 'Only matches if preceded by (not part of the match itself):';
      } else {
        label = 'Only matches if NOT preceded by:';
      }

      const quantifier = describeQuantifier(source, closeIndex + 1);
      const suffix = quantifier ? ` Repeated: ${quantifier.text}.` : '';
      parts.push({ token: fullToken, description: `${label} ${innerSummary}${suffix}` });
      i = closeIndex + 1 + (quantifier ? quantifier.length : 0);
    } else {
      // A run of plain literal characters. Stopped one character early
      // whenever a quantifier is about to follow, so the quantifier binds
      // to just that last character - matching real regex semantics
      // (e.g. in "abc+", only the "c" repeats).
      const start = i;
      while (i < source.length && !DISPATCH_CHARS.test(source[i])) {
        const rest = source.slice(i + 1);
        const nextIsQuantifier = /^[*+?]/.test(rest) || /^\{\d+(,\d*)?\}/.test(rest);
        i++;
        if (nextIsQuantifier) break;
      }
      const run = source.slice(start, i);
      if (run.length > 1) {
        i = pushQuantified(parts, source, start, i, `the literal text "${run}"`);
      } else if (run.length === 1) {
        i = pushQuantified(parts, source, start, i, `the character "${run}"`);
      } else {
        // A single dispatch-worthy character reached this branch by
        // mistake (shouldn't happen) - advance by one so the walk can
        // never stall.
        i++;
      }
    }
  }

  return parts;
}

export function explainRegex(source) {
  if (!source) return [];
  try {
    return walkSequence(source, { current: 0 });
  } catch {
    // Never let a parsing edge case break the page - an empty
    // explanation is a fine fallback for a best-effort feature.
    return [];
  }
}

// --- Common patterns (quick-insert buttons) -----------------------------------------
//
// Deliberately practical rather than airtight - each one is meant to
// catch the common/expected shape of its format for testing purposes,
// not to serve as a strict standards-compliant validator (e.g. the email
// pattern doesn't implement the full RFC 5322 grammar, and nothing
// realistically does for everyday use).

export const COMMON_PATTERNS = [
  { id: 'email', label: 'Email', pattern: String.raw`[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}`, flags: ['g'] },
  { id: 'url', label: 'URL', pattern: String.raw`https?:\/\/[^\s/$.?#][^\s]*`, flags: ['g', 'i'] },
  { id: 'phone', label: 'Phone Number', pattern: String.raw`\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}`, flags: ['g'] },
  {
    id: 'ipv4',
    label: 'IPv4',
    pattern: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b`,
    flags: ['g'],
  },
  { id: 'ipv6', label: 'IPv6', pattern: String.raw`\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b`, flags: ['g'] },
  { id: 'uuid', label: 'UUID', pattern: String.raw`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`, flags: ['g', 'i'] },
  { id: 'date', label: 'Date (YYYY-MM-DD)', pattern: String.raw`\d{4}-\d{2}-\d{2}`, flags: ['g'] },
  { id: 'time', label: 'Time (HH:MM)', pattern: String.raw`([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?`, flags: ['g'] },
  { id: 'zip', label: 'ZIP Code', pattern: String.raw`\b\d{5}(?:-\d{4})?\b`, flags: ['g'] },
  { id: 'username', label: 'Username', pattern: String.raw`^[a-zA-Z0-9_]{3,16}$`, flags: [] },
  {
    id: 'password',
    label: 'Strong Password',
    pattern: String.raw`^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$`,
    flags: [],
  },
  { id: 'hex-color', label: 'Hex Color', pattern: String.raw`#(?:[0-9a-fA-F]{3}){1,2}\b`, flags: ['g'] },
  { id: 'html-tags', label: 'HTML Tags', pattern: String.raw`<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>`, flags: ['g'] },
  { id: 'whitespace', label: 'Whitespace', pattern: String.raw`\s+`, flags: ['g'] },
  { id: 'numbers', label: 'Numbers', pattern: String.raw`\d+`, flags: ['g'] },
  { id: 'letters', label: 'Letters Only', pattern: String.raw`[a-zA-Z]+`, flags: ['g'] },
  { id: 'alphanumeric', label: 'Alphanumeric', pattern: String.raw`[a-zA-Z0-9]+`, flags: ['g'] },
];

// --- Cheat sheet --------------------------------------------------------------------

export const CHEAT_SHEET = [
  { token: '.', description: 'Any character except a line break (unless the s flag is on).' },
  { token: '*', description: 'Zero or more of the previous token.' },
  { token: '+', description: 'One or more of the previous token.' },
  { token: '?', description: 'Zero or one of the previous token. Also marks a quantifier as lazy, e.g. *?.' },
  { token: '[ ]', description: 'A character class - matches any one character inside, e.g. [abc] or [a-z].' },
  { token: '[^ ]', description: 'A negated character class - matches any one character NOT listed, e.g. [^0-9].' },
  { token: '( )', description: 'A capturing group - remembers the matched text for use in results or as $1, $2... in a replacement.' },
  { token: '(?: )', description: 'A non-capturing group - groups a pattern without remembering the match.' },
  { token: '{ }', description: 'A quantifier range, e.g. {3}, {2,5}, or {2,}.' },
  { token: '^', description: 'Anchors to the start of the string (or line, with the m flag).' },
  { token: '$', description: 'Anchors to the end of the string (or line, with the m flag).' },
  { token: '|', description: 'Alternation - matches whatever is on either side, like cat|dog.' },
  { token: '\\d  \\D', description: 'Any digit, or any non-digit.' },
  { token: '\\w  \\W', description: 'Any word character (letter/digit/underscore), or any non-word character.' },
  { token: '\\s  \\S', description: 'Any whitespace character, or any non-whitespace character.' },
  { token: '\\b  \\B', description: 'A word boundary, or a position that is NOT a word boundary.' },
  { token: '(?= )', description: 'Lookahead - matches only if followed by this pattern, without consuming it.' },
  { token: '(?! )', description: 'Negative lookahead - matches only if NOT followed by this pattern.' },
  { token: '(?<= )', description: 'Lookbehind - matches only if preceded by this pattern. Supported in all current major browsers.' },
  { token: '(?<! )', description: 'Negative lookbehind - matches only if NOT preceded by this pattern.' },
  { token: '\\.', description: 'A backslash escapes a special character, making it literal - \\. matches an actual period.' },
];

// --- Flags -----------------------------------------------------------------------

export const FLAG_OPTIONS = [
  { key: 'g', name: 'Global', hint: 'Find every match, not just the first.' },
  { key: 'i', name: 'Ignore Case', hint: 'Case-insensitive matching.' },
  { key: 'm', name: 'Multiline', hint: '^ and $ also match right after/before line breaks.' },
  { key: 's', name: 'Dot All', hint: 'Lets . also match line breaks.' },
  { key: 'u', name: 'Unicode', hint: 'Treats the pattern as a sequence of Unicode code points.' },
  { key: 'y', name: 'Sticky', hint: 'Matches only starting at the exact last match position.' },
];

export const DEFAULT_FLAGS = ['g'];

// Builds the actual flags string passed to `new RegExp`, always in the
// same canonical order regardless of the order flags were toggled in -
// so the same set of active flags always produces the same regex, which
// matters for e.g. React re-render memoization and just for predictability.
export function buildFlagsString(activeFlags) {
  return FLAG_OPTIONS.filter((option) => activeFlags.includes(option.key))
    .map((option) => option.key)
    .join('');
}

// --- Test text file upload ----------------------------------------------------------

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function validateTestTextFile(file) {
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

export function readTestTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}
