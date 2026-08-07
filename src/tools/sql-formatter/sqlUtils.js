// -----------------------------------------------------------------------
// SQL FORMATTING LOGIC - no React, no DOM. Wraps the `sql-formatter`
// package (the one dependency this tool adds - hand-rolling a
// multi-dialect SQL parser/formatter from scratch isn't practical, and
// this library is pure JS with no Node-only APIs, so it works fine
// bundled for the browser). Every UI-facing function here still returns
// a plain `{ ok, ... }` result rather than throwing, matching the
// validate*()/format*() vocabulary used throughout this site.
// -----------------------------------------------------------------------

import { format as formatWithLibrary } from 'sql-formatter';

export const DIALECTS = [
  { id: 'sql', label: 'Generic SQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'tsql', label: 'SQL Server' },
];

export const KEYWORD_CASE_OPTIONS = [
  { id: 'upper', label: 'UPPERCASE' },
  { id: 'lower', label: 'lowercase' },
];

export const INDENT_OPTIONS = [
  { id: 2, label: '2 spaces' },
  { id: 4, label: '4 spaces' },
];

export const LINES_BETWEEN_OPTIONS = [
  { id: 1, label: '1' },
  { id: 2, label: '2' },
];

export function createDefaultOptions() {
  return { dialect: 'sql', keywordCase: 'upper', indentSize: 2, linesBetweenQueries: 1 };
}

// A deliberately messy, unformatted multi-clause query - picked so
// clicking "Format SQL" on it visibly does something (indentation,
// keyword casing, clause line-breaks all change at once).
export const EXAMPLE_SQL =
  "select u.id, u.name, count(o.id) as order_count from users u left join orders o on o.user_id = u.id where u.active = true group by u.id, u.name having count(o.id) > 0 order by order_count desc limit 10;";

// Checks there's actually something to format. The library itself
// handles genuinely empty/whitespace-only input fine, but treating it
// as a distinct "nothing to do yet" case (rather than a real error) is
// what matches the empty-input handling every other tool on this site
// uses.
export function validateSql(sql) {
  if (!sql.trim()) return { ok: false, error: '' };
  return { ok: true };
}

// sql-formatter's parser errors are extremely verbose (a full dump of
// the grammar rules it was expecting next) - useful for debugging the
// library itself, not for a person pasting a typo'd query. This pulls
// out just the line/column location, if the message has one, and
// discards the rest.
function simplifyFormatError(error) {
  const match = error.message.match(/at line (\d+) column (\d+)/);
  if (match) {
    return `This doesn't look like valid SQL - check for a syntax error near line ${match[1]}, column ${match[2]} (unbalanced parentheses, quotes, or a missing keyword are common causes).`;
  }
  return "This doesn't look like valid SQL - check for unbalanced parentheses, quotes, or missing keywords.";
}

// --- File upload -----------------------------------------------------------------------

// Reading the file is fully generic (any text file, any extension) and
// already exists as readTestTextFile() in regex-tester/regexUtils.js -
// SqlFormatter.jsx imports that directly rather than duplicating it.
// Only the VALIDATION needs to be specific to this tool (checking for
// `.sql` rather than `.txt`), so that part lives here instead.
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function validateSqlFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `That file is too large to load safely (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).`,
    };
  }
  const looksLikeSql =
    file.type === '' || file.type === 'text/plain' || file.type.includes('sql') || /\.sql$/i.test(file.name);
  if (!looksLikeSql) {
    return { ok: false, error: 'Please choose a .sql file.' };
  }
  return { ok: true, error: '' };
}

// The main entry point: validates there's input, then formats it with
// the library - catching ANY parse/format failure and turning it into
// the friendly message above rather than ever letting it crash the UI.
export function formatSql(sql, options) {
  const validation = validateSql(sql);
  if (!validation.ok) return validation;

  try {
    const formatted = formatWithLibrary(sql, {
      language: options.dialect,
      keywordCase: options.keywordCase,
      tabWidth: options.indentSize,
      useTabs: false,
      linesBetweenQueries: options.linesBetweenQueries,
    });
    return { ok: true, formatted };
  } catch (error) {
    return { ok: false, error: simplifyFormatError(error) };
  }
}
