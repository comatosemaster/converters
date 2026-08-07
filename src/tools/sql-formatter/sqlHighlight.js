// -----------------------------------------------------------------------
// SQL SYNTAX HIGHLIGHTING - turns raw SQL text into an HTML string with
// colored <span>s per token, for both the input editor's highlight
// overlay and the read-only formatted-output block.
//
// Same shape as json-formatter-validator/jsonHighlight.js: a lenient
// TOKENIZER, not a parser - it has to run on text that might be
// mid-edit or genuinely invalid SQL, so it just classifies each chunk of
// text by what it looks like. Every character of the input is
// guaranteed to appear exactly once in the output, so the highlighted
// version always lines up with the real text underneath it.
//
// Reuses the .json-hl-* color classes already defined for the JSON
// Formatter/JWT Decoder tools (keyword -> key's purple, string ->
// string's green, number -> number's blue, punctuation -> punctuation's
// muted tone) rather than inventing a parallel set of SQL-specific
// color tokens - only comments need a class of their own, since JSON
// has no comment syntax to reuse.
// -----------------------------------------------------------------------

// A broad, dialect-agnostic keyword list - this is presentation only
// (which color a word gets), not a validity check, so it deliberately
// covers clauses, joins, and common data types from every supported
// dialect in one shared list rather than five nearly-identical ones.
const KEYWORDS = new Set(
  [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE',
    'TABLE', 'ALTER', 'DROP', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON',
    'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS',
    'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'DISTINCT', 'UNION', 'ALL', 'ANY', 'CASE', 'WHEN',
    'THEN', 'ELSE', 'END', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT', 'UNIQUE', 'INDEX',
    'VIEW', 'TRIGGER', 'PROCEDURE', 'FUNCTION', 'RETURNS', 'RETURN', 'DECLARE', 'BEGIN', 'COMMIT',
    'ROLLBACK', 'TRANSACTION', 'WITH', 'ASC', 'DESC', 'TOP', 'CONSTRAINT', 'CHECK', 'CASCADE', 'IF',
    'ELSEIF', 'WHILE', 'FOR', 'TRUE', 'FALSE', 'INT', 'INTEGER', 'SMALLINT', 'BIGINT', 'VARCHAR',
    'CHAR', 'TEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'BOOLEAN', 'DECIMAL', 'NUMERIC', 'FLOAT',
    'DOUBLE', 'REAL', 'BLOB', 'JSON', 'USING', 'OVER', 'PARTITION', 'WINDOW', 'FILTER', 'RETURNING',
    'CAST', 'COALESCE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  ].map((word) => word.toUpperCase()),
);

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Order matters: earlier alternatives are tried first at each position.
const TOKEN_REGEX =
  /(--[^\n]*)|(\/\*[\s\S]*?(?:\*\/|$))|('(?:[^'\\]|\\.|'')*'?)|("(?:[^"\\]|\\.|"")*"?)|(`(?:[^`\\]|\\.|``)*`?)|(\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([(),;.*=<>!+\-/%])|(\s+)/g;

export function highlightSql(text) {
  let html = '';
  let lastIndex = 0;
  let match;

  TOKEN_REGEX.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const [full, comment1, comment2, singleQuoted, doubleQuoted, backtickQuoted, number, word, punctuation, space] = match;

    if (comment1 !== undefined || comment2 !== undefined) {
      html += `<span class="sql-hl-comment">${escapeHtml(full)}</span>`;
    } else if (singleQuoted !== undefined || doubleQuoted !== undefined) {
      html += `<span class="json-hl-string">${escapeHtml(full)}</span>`;
    } else if (backtickQuoted !== undefined) {
      // A backtick-quoted identifier (MySQL) isn't a string value - it's
      // a name, so it's colored like a keyword/identifier rather than
      // like string data.
      html += `<span class="json-hl-key">${escapeHtml(full)}</span>`;
    } else if (number !== undefined) {
      html += `<span class="json-hl-number">${escapeHtml(full)}</span>`;
    } else if (word !== undefined) {
      const className = KEYWORDS.has(word.toUpperCase()) ? 'json-hl-key' : '';
      html += className ? `<span class="${className}">${escapeHtml(full)}</span>` : escapeHtml(full);
    } else if (punctuation !== undefined) {
      html += `<span class="json-hl-punctuation">${escapeHtml(full)}</span>`;
    } else if (space !== undefined) {
      html += escapeHtml(full); // whitespace doesn't need a color
    } else {
      html += escapeHtml(full);
    }

    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < text.length) html += escapeHtml(text.slice(lastIndex));

  return html;
}
