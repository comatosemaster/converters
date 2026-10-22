import Papa from 'papaparse';

// -----------------------------------------------------------------------
// CSV <-> JSON conversion logic - no UI here. Parsing and writing CSV is
// done by Papa Parse, which handles the hard parts of real-world CSV
// (quoted fields containing commas or line breaks, doubled "" quotes,
// delimiter detection). The JSON side - typing values, flattening nested
// objects into columns - is ours, so it behaves predictably.
// -----------------------------------------------------------------------

export const DELIMITERS = [
  { id: 'auto', label: 'Auto-detect', value: '' },
  { id: 'comma', label: 'Comma ( , )', value: ',' },
  { id: 'semicolon', label: 'Semicolon ( ; )', value: ';' },
  { id: 'tab', label: 'Tab', value: '\t' },
  { id: 'pipe', label: 'Pipe ( | )', value: '|' },
];

const DELIMITER_NAMES = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };

export function delimiterName(value) {
  return DELIMITER_NAMES[value] ?? `"${value}"`;
}

export const EXAMPLE_CSV = `id,name,email,city,active,joined
1,Ana Beridze,ana@example.com,Tbilisi,true,2024-03-15
2,"Smith, John",john@example.com,"New York",false,2023-11-02
3,Maria García,maria@example.com,Madrid,true,2025-01-20
4,"Lee ""Jay"" Park",jay@example.com,Seoul,true,2022-07-09`;

export const EXAMPLE_JSON = `[
  {
    "id": 1,
    "name": "Ana Beridze",
    "address": { "city": "Tbilisi", "zip": "0105" },
    "tags": ["admin", "editor"],
    "active": true
  },
  {
    "id": 2,
    "name": "Smith, John",
    "address": { "city": "New York", "zip": "10001" },
    "tags": [],
    "active": false
  }
]`;

// Turns a CSV cell into a number/boolean/null only when that is clearly
// what it is. Deliberately stricter than "anything Number() accepts":
// a ZIP code like 0105 or a phone number like 007 keeps its leading zero
// as text, and a 20-digit ID stays text rather than silently losing its
// last digits to floating-point rounding.
function typeValue(raw) {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
    const number = Number(value);
    if (Number.isInteger(number) ? Number.isSafeInteger(number) : value.replace(/[-.]/g, '').length <= 15) {
      return number;
    }
  }
  return raw;
}

// Papa Parse reports problems per row; most are harmless (a short row)
// but worth surfacing. Row numbers are 1-based for people.
function describeCsvErrors(errors) {
  return errors.slice(0, 5).map((error) => {
    const where = typeof error.row === 'number' ? `Row ${error.row + 1}: ` : '';
    return `${where}${error.message}`;
  });
}

// Header names have to be unique to become JSON keys - a second "name"
// column would otherwise silently overwrite the first. Blank headers get
// a positional name instead of becoming an empty "" key.
function uniqueHeaders(row) {
  const seen = new Map();
  return row.map((cell, index) => {
    const base = String(cell).trim() || `column${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

// Sets obj["a.b.c"] as nested objects: { a: { b: { c: value } } }.
function setNested(target, path, value) {
  const keys = path.split('.');
  let node = target;
  keys.slice(0, -1).forEach((key) => {
    if (typeof node[key] !== 'object' || node[key] === null || Array.isArray(node[key])) node[key] = {};
    node = node[key];
  });
  node[keys[keys.length - 1]] = value;
}

/**
 * CSV text -> { ok, json, rows, columns, delimiter, warnings } or { ok: false, error }.
 * options: { delimiter, header, typed, unflatten, output: 'objects' | 'arrays', indent }
 */
export function csvToJson(text, options) {
  const result = Papa.parse(text, {
    delimiter: options.delimiter,
    skipEmptyLines: 'greedy',
  });

  const rows = result.data;
  if (rows.length === 0) {
    return { ok: false, error: 'No rows found - the input only contains empty lines.' };
  }

  // Papa Parse's delimiter guess falls back to a comma when nothing fits;
  // a single-column file is fine, so this is only a hint, not an error.
  const warnings = describeCsvErrors(result.errors.filter((e) => e.code !== 'UndetectableDelimiter'));
  const convert = options.typed ? typeValue : (value) => value;

  let data;
  let columns;
  if (options.header) {
    columns = uniqueHeaders(rows[0]);
    const renamed = columns.filter((name, i) => name !== String(rows[0][i]).trim());
    if (renamed.length) warnings.push(`Duplicate or empty column names were renamed: ${renamed.join(', ')}.`);

    // Short rows get "" for the missing cells so every record has the
    // same fields, which is what most code consuming this expects.
    const body = rows.slice(1).map((row) => columns.map((_, i) => convert(row[i] ?? '')));
    if (options.output === 'arrays') {
      data = [columns, ...body];
    } else {
      data = body.map((values) => {
        const record = {};
        columns.forEach((column, i) => {
          if (options.unflatten && column.includes('.')) setNested(record, column, values[i]);
          else record[column] = values[i];
        });
        return record;
      });
    }

    if (rows.some((row) => row.length > columns.length)) {
      warnings.push('Some rows have more cells than there are column names - the extra cells were dropped.');
    }
  } else {
    columns = [];
    data = rows.map((row) => row.map(convert));
  }

  const indent = options.indent === 'tab' ? '\t' : Number(options.indent);
  return {
    ok: true,
    json: JSON.stringify(data, null, indent || undefined),
    rows: options.header ? rows.length - 1 : rows.length,
    columns: options.header ? columns.length : Math.max(...rows.map((row) => row.length)),
    delimiter: result.meta.delimiter,
    preview: { header: options.header ? columns : null, rows: options.header ? rows.slice(1) : rows },
    warnings,
  };
}

// --- JSON -> CSV ------------------------------------------------------------

// { a: { b: 1 }, c: [1, 2] } -> { "a.b": 1, c: "[1,2]" }. Arrays are kept
// as JSON text in one cell: spreading them over numbered columns
// (tags.0, tags.1...) makes the column count depend on the longest list
// and is hard to turn back into the original.
function flatten(value, prefix, out) {
  Object.entries(value).forEach(([key, inner]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (inner !== null && typeof inner === 'object' && !Array.isArray(inner) && Object.keys(inner).length) {
      flatten(inner, path, out);
    } else {
      out[path] = inner;
    }
  });
  return out;
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Finds the list of records in common JSON shapes: a plain array, an
// API-style wrapper like { "data": [...] }, or a single object (one row).
function findRecords(value) {
  if (Array.isArray(value)) return { records: value, note: '' };
  if (value !== null && typeof value === 'object') {
    const arrays = Object.entries(value).filter(
      ([, inner]) => Array.isArray(inner) && inner.length && inner.every((item) => item && typeof item === 'object'),
    );
    if (arrays.length === 1) {
      return { records: arrays[0][1], note: `Converted the "${arrays[0][0]}" list inside the top-level object.` };
    }
    return { records: [value], note: 'The input is a single object, so it became a single row.' };
  }
  return null;
}

/**
 * JSON value (already parsed) -> { ok, csv, rows, columns, notes } or { ok: false, error }.
 * options: { delimiter, header, flatten, quoteAll, escapeFormulas, lineEnding }
 */
export function jsonToCsv(value, options) {
  const found = findRecords(value);
  if (!found) {
    return { ok: false, error: 'CSV needs a list of rows - paste a JSON array (or an object) rather than a single value.' };
  }
  const { records, note } = found;
  if (records.length === 0) return { ok: false, error: 'The JSON array is empty - there are no rows to convert.' };

  const notes = note ? [note] : [];
  const unparseOptions = {
    delimiter: options.delimiter || ',',
    quotes: options.quoteAll,
    newline: options.lineEnding,
    escapeFormulae: options.escapeFormulas,
  };

  // An array of arrays is already a table: write it as-is.
  if (records.every(Array.isArray)) {
    const rows = records.map((row) => row.map(cellText));
    return {
      ok: true,
      csv: Papa.unparse(rows, unparseOptions),
      rows: rows.length,
      columns: Math.max(...rows.map((row) => row.length)),
      preview: { header: null, rows },
      notes,
    };
  }

  // Columns are the union of every record's keys, in first-seen order, so
  // a key that only appears in a later record still gets its own column.
  const isRecord = (item) => item !== null && typeof item === 'object' && !Array.isArray(item);
  const flatRecords = records.map((record) => {
    if (!isRecord(record)) return { value: record };
    return options.flatten ? flatten(record, '', {}) : record;
  });
  if (!records.every(isRecord)) {
    notes.push('Some items were plain values rather than objects; they were put in a "value" column.');
  }
  const columns = [];
  const seen = new Set();
  flatRecords.forEach((record) =>
    Object.keys(record).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }),
  );

  const rows = flatRecords.map((record) => columns.map((column) => cellText(record[column])));
  const table = options.header ? [columns, ...rows] : rows;
  if (!options.flatten && flatRecords.some((record) => Object.values(record).some((v) => v && typeof v === 'object'))) {
    notes.push('Nested objects were written as JSON text. Turn on "Flatten nested objects" to give each field its own column.');
  }

  return {
    ok: true,
    csv: Papa.unparse(table, unparseOptions),
    rows: rows.length,
    columns: columns.length,
    preview: { header: columns, rows },
    notes,
  };
}
