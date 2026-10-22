import { parsePageRange } from '../pdf-merge/pdfMergeUtils.js';

// -----------------------------------------------------------------------
// PDF SPLIT LOGIC - no React. Page lists are 0-based indices throughout;
// only text shown to people uses 1-based page numbers.
//
// Splitting uses pdf-lib, which copies pages as they are: text stays
// selectable, vector graphics sharp, and nothing is re-compressed.
// Page-range parsing is shared with the PDF Merge tool.
// -----------------------------------------------------------------------

export const MODES = [
  { id: 'extract', label: 'Extract pages', hint: 'One new PDF with the pages you pick.' },
  { id: 'remove', label: 'Remove pages', hint: 'A copy of the PDF without the pages you pick.' },
  { id: 'every', label: 'Split every N pages', hint: 'Equal-sized parts, e.g. chapters of 10 pages.' },
  { id: 'ranges', label: 'Split by ranges', hint: 'One PDF per range you type.' },
  { id: 'single', label: 'One PDF per page', hint: 'Every page as its own file.' },
];

/** [0, 1, 2, 4, 7, 8] -> "1-3, 5, 8-9" (1-based, sorted, no duplicates). */
export function compressRanges(indices) {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i += 1;
    parts.push(start === sorted[i] ? `${start + 1}` : `${start + 1}-${sorted[i] + 1}`);
  }
  return parts.join(', ');
}

/** Pages split into consecutive groups of `size`. */
export function splitEvery(pageCount, size) {
  const groups = [];
  for (let start = 0; start < pageCount; start += size) {
    groups.push(Array.from({ length: Math.min(size, pageCount - start) }, (_, i) => start + i));
  }
  return groups;
}

/**
 * "1-3, 4-8, 9-" -> [[0,1,2], [3..7], [8..end]]: each comma-separated part
 * becomes its own file. Returns { ok, groups } or { ok: false, error }.
 */
export function parseRangeGroups(text, pageCount) {
  const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Type at least one range, like 1-3, 4-10.' };
  const groups = [];
  for (const part of parts) {
    const parsed = parsePageRange(part, pageCount);
    if (!parsed.ok) return parsed;
    groups.push(parsed.pages);
  }
  return { ok: true, groups };
}

/** Works out which files to create. Returns { ok, groups } or { ok: false, error }. */
export function planOutput(mode, { pageCount, selected, everyN, rangesText }) {
  if (mode === 'extract' || mode === 'remove') {
    const picked = [...selected].sort((a, b) => a - b);
    if (picked.length === 0) return { ok: false, error: 'Select at least one page.' };
    if (mode === 'extract') return { ok: true, groups: [picked] };
    const keep = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !selected.has(i));
    if (keep.length === 0) return { ok: false, error: "That would remove every page - leave at least one unselected." };
    return { ok: true, groups: [keep] };
  }
  if (mode === 'every') {
    const n = Math.floor(Number(everyN));
    if (!n || n < 1) return { ok: false, error: 'Enter how many pages each part should have.' };
    return { ok: true, groups: splitEvery(pageCount, n) };
  }
  if (mode === 'ranges') return parseRangeGroups(rangesText, pageCount);
  return { ok: true, groups: splitEvery(pageCount, 1) };
}

export function partName(base, pages, mode) {
  if (mode === 'remove') return `${base}-edited.pdf`;
  const label = compressRanges(pages).replace(/, /g, '_');
  return `${base}-${pages.length === 1 ? 'page' : 'pages'}-${label}.pdf`;
}

/**
 * Builds one PDF per group from the source bytes. Returns [{ name, blob }].
 * `onProgress(done, total)` after each file.
 */
export async function buildParts(bytes, groups, { base, mode }, onProgress) {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes);
  const parts = [];
  for (let i = 0; i < groups.length; i += 1) {
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(source, groups[i]);
    pages.forEach((page) => doc.addPage(page));
    // Keep the original title/author so the parts don't look anonymous.
    const title = source.getTitle();
    if (title) doc.setTitle(title);
    const author = source.getAuthor();
    if (author) doc.setAuthor(author);
    parts.push({ name: partName(base, groups[i], mode), blob: new Blob([await doc.save()], { type: 'application/pdf' }) });
    onProgress?.(i + 1, groups.length);
  }
  return parts;
}
