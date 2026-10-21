// -----------------------------------------------------------------------
// TEXT DIFF LOGIC - no React. Kept separate from TextDiff.jsx so the
// comparison and the row-building for the side-by-side view can be read
// (and reasoned about) independently of the UI.
//
// The actual diffing is done by the `diff` library (jsdiff), which
// implements Myers' algorithm - the same one behind `git diff`.
// -----------------------------------------------------------------------

import { createTwoFilesPatch, diffChars, diffLines, diffWords, diffWordsWithSpace } from 'diff';

export const MODES = [
  { id: 'lines', label: 'Lines' },
  { id: 'words', label: 'Words' },
  { id: 'chars', label: 'Characters' },
];

// Give up rather than freeze the page when two huge, very different texts
// would take ages to compare.
const TIMEOUT_MS = 1500;

// Unchanged runs longer than this get folded, keeping this many lines of
// context on each side of every change.
const CONTEXT_LINES = 3;

export function splitLines(text) {
  if (text === '') return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // A trailing newline ends the last line; it doesn't start a new empty one.
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Returns jsdiff's list of change objects ({ value, count, added, removed }),
// or null if the comparison timed out.
export function computeDiff(original, changed, { mode, ignoreCase, ignoreWhitespace }) {
  const a = original.replace(/\r\n?/g, '\n');
  const b = changed.replace(/\r\n?/g, '\n');
  if (mode === 'lines') {
    // jsdiff's line mode has no ignoreCase option, so equality is decided
    // by our own comparator that applies both "ignore" settings.
    const normalize = (line) => {
      let value = line.replace(/\n$/, '');
      if (ignoreWhitespace) value = value.trim().replace(/\s+/g, ' ');
      if (ignoreCase) value = value.toLowerCase();
      return value;
    };
    return diffLines(a, b, {
      timeout: TIMEOUT_MS,
      comparator: (left, right) => normalize(left) === normalize(right),
    }) ?? null;
  }
  if (mode === 'words') {
    const diff = ignoreWhitespace ? diffWords : diffWordsWithSpace;
    return diff(a, b, { timeout: TIMEOUT_MS, ignoreCase }) ?? null;
  }
  return diffChars(a, b, { timeout: TIMEOUT_MS, ignoreCase }) ?? null;
}

// How much was added and removed, counted in the mode's own units.
export function countChanges(changes, mode) {
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    if (!change.added && !change.removed) continue;
    let amount;
    if (mode === 'lines') amount = change.count ?? splitLines(change.value).length;
    else if (mode === 'words') amount = (change.value.match(/\S+/g) || []).length;
    else amount = change.value.length;
    if (change.added) added += amount;
    else removed += amount;
  }
  return { added, removed };
}

// Splits one changed line pair into highlighted pieces for each side, so a
// one-word edit doesn't paint the whole line red/green.
function inlinePieces(left, right) {
  const parts = diffWordsWithSpace(left, right);
  return {
    left: parts.filter((p) => !p.added).map((p) => ({ text: p.value, changed: Boolean(p.removed) })),
    right: parts.filter((p) => !p.removed).map((p) => ({ text: p.value, changed: Boolean(p.added) })),
  };
}

// Builds the rows of the line-by-line view from a line-mode diff:
//   { type: 'same' | 'removed' | 'added' | 'changed', left, right }
// where left/right are { number, text, pieces? } or null, plus
//   { type: 'skip', count } for folded runs of unchanged lines.
// Line text is taken from the original inputs by position (not from the
// diff's values), so "ignore case/whitespace" still shows each side as typed.
export function buildLineRows(changes, original, changed, { collapse }) {
  const oldLines = splitLines(original);
  const newLines = splitLines(changed);
  let oldIndex = 0;
  let newIndex = 0;
  const rows = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const count = change.count ?? splitLines(change.value).length;
    if (!change.added && !change.removed) {
      for (let k = 0; k < count; k++) {
        rows.push({
          type: 'same',
          left: { number: oldIndex + 1, text: oldLines[oldIndex] ?? '' },
          right: { number: newIndex + 1, text: newLines[newIndex] ?? '' },
        });
        oldIndex++;
        newIndex++;
      }
    } else if (change.removed && changes[i + 1]?.added) {
      // A removal straight followed by an addition is an edit: pair the
      // lines up side by side.
      const next = changes[i + 1];
      const addedCount = next.count ?? splitLines(next.value).length;
      for (let k = 0; k < Math.max(count, addedCount); k++) {
        const left = k < count ? { number: oldIndex + 1, text: oldLines[oldIndex++] ?? '' } : null;
        const right = k < addedCount ? { number: newIndex + 1, text: newLines[newIndex++] ?? '' } : null;
        if (left && right) {
          const pieces = inlinePieces(left.text, right.text);
          left.pieces = pieces.left;
          right.pieces = pieces.right;
          rows.push({ type: 'changed', left, right });
        } else {
          rows.push({ type: left ? 'removed' : 'added', left, right });
        }
      }
      i++;
    } else if (change.removed) {
      for (let k = 0; k < count; k++) {
        rows.push({ type: 'removed', left: { number: oldIndex + 1, text: oldLines[oldIndex++] ?? '' }, right: null });
      }
    } else {
      for (let k = 0; k < count; k++) {
        rows.push({ type: 'added', left: null, right: { number: newIndex + 1, text: newLines[newIndex++] ?? '' } });
      }
    }
  }

  if (!collapse) return rows;
  return foldUnchanged(rows);
}

function foldUnchanged(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].type !== 'same') {
      out.push(rows[i++]);
      continue;
    }
    let end = i;
    while (end < rows.length && rows[end].type === 'same') end++;
    const run = rows.slice(i, end);
    const keepBefore = i === 0 ? 0 : CONTEXT_LINES; // context after the previous change
    const keepAfter = end === rows.length ? 0 : CONTEXT_LINES; // context before the next change
    if (run.length > keepBefore + keepAfter + 1) {
      out.push(...run.slice(0, keepBefore));
      out.push({ type: 'skip', count: run.length - keepBefore - keepAfter });
      out.push(...run.slice(run.length - keepAfter));
    } else {
      out.push(...run);
    }
    i = end;
  }
  return out;
}

// A standard unified diff ("patch"), as produced by `diff -u` / git.
export function buildPatch(original, changed) {
  return createTwoFilesPatch('original.txt', 'changed.txt', original, changed, '', '', { context: CONTEXT_LINES });
}
