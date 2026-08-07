// -----------------------------------------------------------------------
// FRONTMATTER PARSING - shared by the website (src/blog/blogUtils.js) and
// the content pipeline (content-pipeline/), which validates articles
// before they're published.
//
// It lives in its own file precisely so those two can never disagree
// about what a valid article looks like: the thing that validates an
// article and the thing that renders it run the exact same parser.
//
// Deliberately plain ESM with no imports - the pipeline runs this in
// Node, where Vite-specific features (import.meta.glob, ?raw imports)
// don't exist.
//
// A deliberately small subset of YAML - just what article metadata needs
// (single-line strings, booleans, and one-level inline arrays like
// `tags: [a, b, c]`). Pulling in a full YAML parser for this would be a
// lot of dependency weight for a handful of predictable fields.
// -----------------------------------------------------------------------

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseFrontmatterValue(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => stripQuotes(item.trim()));
  }

  return stripQuotes(trimmed);
}

// Splits a raw .md file into its frontmatter (as a plain object) and the
// markdown body that follows it. Returns `{ data: {}, body: raw }`
// unchanged if the file has no `---` frontmatter block at all.
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const [, frontmatterBlock, body] = match;
  const data = {};

  for (const line of frontmatterBlock.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    data[key] = parseFrontmatterValue(value);
  }

  return { data, body };
}
