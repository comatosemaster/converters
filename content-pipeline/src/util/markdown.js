// -----------------------------------------------------------------------
// MARKDOWN SERIALISATION
//
// Turning structured data back into an article file. Lives here rather
// than in a step because both the writer (draft.js) and the assembler
// need it - having it in either one would make the two steps import each
// other.
//
// This is the inverse of src/blog/frontmatter.js, which the website uses
// to parse. The two must stay compatible: anything written here has to
// survive a round trip through that parser, which is why the quoting
// rules below are conservative.
// -----------------------------------------------------------------------

// Field order in the output file. Fixed so every generated article looks
// the same in a diff, and so a reviewer's eye lands on the same field in
// the same place every time.
const FIELD_ORDER = [
  'title',
  'slug',
  'category',
  'description',
  'excerpt',
  'tags',
  'author',
  'publishDate',
  'updatedDate',
  'featured',
  'difficulty',
  'readingTime',
  'coverImage',
  'seoTitle',
  'metaDescription',
  'relatedTools',
  'relatedArticles',
];

// Serialises a value in the same mini-YAML dialect src/blog/frontmatter.js
// parses: single-line scalars and one-level inline arrays.
//
// Strings are quoted whenever a bare value would be ambiguous to that
// parser - a colon would look like a nested key, a leading "[" like an
// array, and a leading "#" like a comment.
function serializeValue(value) {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);

  // Newlines cannot survive a single-line format, and a silently
  // truncated description would be worse than a visibly collapsed one.
  const text = String(value).replace(/\s*\n\s*/g, ' ');
  const needsQuotes = /[:#]/.test(text) || text.startsWith('[') || text.trim() !== text;
  return needsQuotes ? `"${text.replace(/"/g, '\\"')}"` : text;
}

export function serializeFrontmatter(data) {
  const keys = [
    ...FIELD_ORDER.filter((key) => data[key] !== undefined && data[key] !== null),
    // Anything not in FIELD_ORDER still gets written, so an unexpected
    // field is never silently dropped on the floor.
    ...Object.keys(data).filter((key) => !FIELD_ORDER.includes(key)),
  ];

  const lines = keys.map((key) => `${key}: ${serializeValue(data[key])}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/** A structured draft ({ frontmatter, body }) as a complete .md file. */
export function draftToMarkdown(draft) {
  return `${serializeFrontmatter(draft.frontmatter)}\n${draft.body.trimStart()}`;
}
