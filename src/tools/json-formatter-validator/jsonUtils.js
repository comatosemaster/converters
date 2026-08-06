// -----------------------------------------------------------------------
// JSON LOGIC - no React, no DOM (aside from the tiny File-reading helper).
// Kept separate from JsonFormatter.jsx so parsing/formatting/stats logic
// can be read (or reused) independently of the UI.
// -----------------------------------------------------------------------

// A generous ceiling for uploaded .json files - large enough for any
// realistic config/data file, small enough that parsing it in the main
// thread won't hang the page.
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function validateJsonFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
    return { ok: false, error: 'Please choose a .json file.' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `That file is too large to load safely (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).`,
    };
  }
  return { ok: true, error: '' };
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

// --- Turning a character offset into line/column, and back ------------------

function positionToLineColumn(text, position) {
  const upToPosition = text.slice(0, position);
  const lines = upToPosition.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function lineColumnToPosition(text, line, column) {
  const lines = text.split('\n');
  let position = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    position += lines[i].length + 1; // +1 for the newline character itself
  }
  return position + (column - 1);
}

// Browsers word their JSON.parse error messages differently (and some give
// a character position, others a line/column) - this pulls whichever
// location info is available out of the message and fills in the rest.
function extractErrorLocation(message, text) {
  const lineColumnMatch = message.match(/line (\d+) column (\d+)/i);
  if (lineColumnMatch) {
    const line = Number(lineColumnMatch[1]);
    const column = Number(lineColumnMatch[2]);
    return { line, column, position: lineColumnToPosition(text, line, column) };
  }

  const positionMatch = message.match(/position (\d+)/i);
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    return { position, ...positionToLineColumn(text, position) };
  }

  // No location in the message at all (e.g. "Unexpected end of JSON
  // input") - that error means the JSON was cut off, so point at the end.
  const position = text.length;
  return { position, ...positionToLineColumn(text, position) };
}

// Parses JSON text and reports either the parsed value or a friendly,
// located error. Never throws.
export function validateJson(text) {
  try {
    const value = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error.message, ...extractErrorLocation(error.message, text) };
  }
}

// --- Formatting ---------------------------------------------------------------

// `indent` is either a number of spaces (2, 4) or a literal string like
// '\t' for tabs - both are valid third arguments to JSON.stringify.
export function formatJson(value, indent) {
  return JSON.stringify(value, null, indent);
}

export function minifyJson(value) {
  return JSON.stringify(value);
}

// --- Duplicate key detection ---------------------------------------------------
//
// JSON.parse silently keeps only the LAST value for a repeated key, so its
// result can't tell us a duplicate ever existed - detecting it means
// scanning the raw text ourselves. This is a small hand-written scanner
// (not a full parser): it tracks, for each currently-open `{ ... }`, which
// keys have been seen, using a stack so nested objects each get their own
// fresh set (the same key name in two different objects is not a
// duplicate).
export function findDuplicateKeys(text) {
  const duplicates = new Set();
  const stack = []; // one { keys, expectingKey } frame per open { or [
  let i = 0;
  const { length } = text;

  function skipString() {
    i++; // opening quote
    while (i < length && text[i] !== '"') {
      if (text[i] === '\\') i++; // skip the escaped character too
      i++;
    }
    i++; // closing quote
  }

  while (i < length) {
    const char = text[i];

    if (char === '"') {
      const start = i;
      skipString();

      let after = i;
      while (after < length && /\s/.test(text[after])) after++;
      const top = stack[stack.length - 1];
      const isKey = top && top.isObject && top.expectingKey && text[after] === ':';

      if (isKey) {
        const key = text.slice(start + 1, i - 1);
        if (top.keys.has(key)) duplicates.add(key);
        top.keys.add(key);
        top.expectingKey = false;
      }
      continue; // i is already past the closing quote
    }

    if (char === '{') {
      stack.push({ keys: new Set(), expectingKey: true, isObject: true });
    } else if (char === '[') {
      stack.push({ isObject: false });
    } else if (char === '}' || char === ']') {
      stack.pop();
    } else if (char === ',' && stack.length > 0 && stack[stack.length - 1].isObject) {
      stack[stack.length - 1].expectingKey = true;
    }

    i++;
  }

  return [...duplicates];
}

// --- Statistics -----------------------------------------------------------------

// A depth this deep is already pathological - capping it means a
// maliciously/accidentally deeply-nested file can't crash the tab by
// blowing the call stack while we count it.
const MAX_STATS_DEPTH = 500;

export function calculateJsonStats(text, value) {
  const charCount = text.length;
  const charCountNoWhitespace = text.replace(/\s/g, '').length;
  const lineCount = text.split('\n').length;
  // Uses Blob to get the actual byte size (UTF-8), not just JS string
  // length, which undercounts for any non-ASCII character.
  const fileSize = new Blob([text]).size;

  let objectCount = 0;
  let arrayCount = 0;
  let keyCount = 0;
  let maxDepth = 0;
  let depthLimitHit = false;

  function walk(node, depth) {
    if (depth > MAX_STATS_DEPTH) {
      depthLimitHit = true;
      return;
    }
    if (Array.isArray(node)) {
      maxDepth = Math.max(maxDepth, depth);
      arrayCount++;
      node.forEach((item) => walk(item, depth + 1));
    } else if (node !== null && typeof node === 'object') {
      maxDepth = Math.max(maxDepth, depth);
      objectCount++;
      const keys = Object.keys(node);
      keyCount += keys.length;
      keys.forEach((key) => walk(node[key], depth + 1));
    }
  }

  if (value !== undefined) walk(value, 1);

  return {
    charCount,
    charCountNoWhitespace,
    lineCount,
    fileSize,
    objectCount,
    arrayCount,
    keyCount,
    maxDepth,
    depthLimitHit,
  };
}

// --- Explaining what the "Fix JSON" button changed ------------------------------
//
// The repair library (jsonrepair) just returns a corrected string - it
// doesn't report what it did. Rather than diffing the two strings
// character-by-character (which wouldn't map cleanly onto "here's what was
// wrong" for a human anyway), we re-examine the ORIGINAL broken text for a
// handful of well-known problem patterns and report which ones were
// present. It's a best-effort summary, not a precise change log.
function countChar(text, char) {
  return text.split(char).length - 1;
}

export function describeFixes(original, repaired) {
  const notes = [];

  if (/,\s*[}\]]/.test(original)) {
    notes.push('Removed trailing comma(s) before a closing bracket.');
  }

  if (/:\s*'[^']*'/.test(original) || /[{,]\s*'[^']*'\s*:/.test(original)) {
    notes.push('Converted single-quoted strings to double quotes.');
  }

  if (/[{,]\s*[A-Za-z_$][\w$]*\s*:/.test(original)) {
    notes.push('Added missing quotes around object key(s).');
  }

  if (/\/\/|\/\*/.test(original)) {
    notes.push('Removed comments - JSON has no comment syntax.');
  }

  const bracketsChanged = ['{', '}', '[', ']'].some(
    (char) => countChar(original, char) !== countChar(repaired, char),
  );
  if (bracketsChanged) {
    notes.push('Added or balanced missing brackets/braces.');
  }

  if (notes.length === 0) {
    notes.push('Adjusted JSON syntax to make it valid.');
  }

  return notes;
}
