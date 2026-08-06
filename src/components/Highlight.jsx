// Wraps the part of `text` that matches `query` in a <mark>, so search
// results visibly show WHY they matched. Falls back to plain text when
// there's no query or no match.

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function Highlight({ text, query }) {
  const trimmed = query?.trim();
  if (!trimmed) return text;

  // Split on the query while KEEPING it (the capture group), so the parts
  // array alternates between non-matching and matching chunks.
  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, 'gi'));
  if (parts.length === 1) return text;

  return parts.map((part, index) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      // eslint-disable-next-line react/no-array-index-key
      <mark key={index}>{part}</mark>
    ) : (
      part
    ),
  );
}
