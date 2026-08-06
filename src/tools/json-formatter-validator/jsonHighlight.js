// -----------------------------------------------------------------------
// JSON SYNTAX HIGHLIGHTING — turns raw JSON text into an HTML string with
// colored <span>s per token, for the editor's highlight overlay (see the
// "Editor overlay" comment in JsonFormatter.jsx for how it's displayed).
//
// This is a lenient TOKENIZER, not a parser — it has to run on text that
// might currently be invalid (mid-edit, or genuinely broken), so it just
// classifies each chunk of text by what it looks like rather than
// requiring the whole document to be valid JSON. Every character of the
// input is guaranteed to appear exactly once in the output, so the
// highlighted version always lines up with the real text underneath it.
// -----------------------------------------------------------------------

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Order matters: earlier alternatives are tried first at each position.
// The final `[^\s"{}[\],:]+` is a catch-all for anything else (like an
// unquoted key, or otherwise malformed text) so nothing is ever dropped.
const TOKEN_REGEX =
  /("(?:\\.|[^"\\])*"?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}[\]:,])|(\s+)|([^\s"{}[\],:]+)/g;

export function highlightJson(text) {
  let html = '';
  let lastIndex = 0;
  let match;

  TOKEN_REGEX.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const [full, stringToken, numberToken, booleanToken, nullToken, punctuationToken, spaceToken] = match;

    if (stringToken !== undefined) {
      // A string is a KEY if, skipping whitespace, a colon follows it —
      // otherwise it's a value. Peeking at the real text (not another
      // regex token) keeps this simple and always in sync.
      let after = TOKEN_REGEX.lastIndex;
      while (after < text.length && /\s/.test(text[after])) after++;
      const className = text[after] === ':' ? 'json-hl-key' : 'json-hl-string';
      html += `<span class="${className}">${escapeHtml(full)}</span>`;
    } else if (numberToken !== undefined) {
      html += `<span class="json-hl-number">${escapeHtml(full)}</span>`;
    } else if (booleanToken !== undefined) {
      html += `<span class="json-hl-boolean">${escapeHtml(full)}</span>`;
    } else if (nullToken !== undefined) {
      html += `<span class="json-hl-null">${escapeHtml(full)}</span>`;
    } else if (punctuationToken !== undefined) {
      html += `<span class="json-hl-punctuation">${escapeHtml(full)}</span>`;
    } else if (spaceToken !== undefined) {
      html += escapeHtml(full); // whitespace doesn't need a color
    } else {
      // Doesn't look like any known token (e.g. an unquoted key, or
      // genuinely invalid syntax) — left uncolored, which itself is a
      // useful visual signal that something here isn't recognized.
      html += escapeHtml(full);
    }

    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < text.length) html += escapeHtml(text.slice(lastIndex));

  return html;
}
