// -----------------------------------------------------------------------
// PDF MERGE LOGIC - no React, no UI. Kept separate from PdfMerge.jsx so
// validation, page-range parsing and the merge itself can be read (or
// reused, e.g. by a future "Split PDF" tool) independently of the
// component, matching the pattern used by imageToPdfUtils.js.
//
// Merging uses pdf-lib, which copies pages between documents as-is: text
// stays selectable, vector graphics stay sharp, and nothing is
// re-compressed - unlike tools that rasterize pages into images.
// -----------------------------------------------------------------------

// Generous, but past this, holding several PDFs in memory at once stops
// being comfortable for a browser tab (especially on phones).
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export function validatePdfFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `Too large to merge in the browser (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).` };
  }
  const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!looksLikePdf) return { ok: false, error: 'Not a PDF file.' };
  return { ok: true, error: '' };
}

// pdf-lib is loaded on demand so it never weighs down any other page.
function loadPdfLib() {
  return import('pdf-lib');
}

// Reads a PDF and returns { bytes, pageCount }. Throws a friendly Error for
// files pdf-lib can't use.
export async function readPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A real PDF starts with "%PDF" (sometimes after a little junk); checking
  // the first KB catches renamed non-PDFs before pdf-lib's vaguer errors.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF')) throw new Error("This file isn't a valid PDF.");

  const { PDFDocument } = await loadPdfLib();
  let doc;
  try {
    doc = await PDFDocument.load(bytes);
  } catch (error) {
    if (/encrypt/i.test(error?.message ?? '')) {
      throw new Error(
        'This PDF is password-protected or encrypted, which this tool can’t read. Remove the protection first, then try again.',
      );
    }
    throw new Error('This PDF appears to be damaged and couldn’t be read.');
  }
  return { bytes, pageCount: doc.getPageCount() };
}

// Turns what the user typed into a list of 0-based page indices.
//   ""            -> every page
//   "1-3, 5, 9-"  -> pages 1, 2, 3, 5, then 9 to the end
//   "5-3"         -> pages 5, 4, 3 (reversed ranges are allowed)
// Returns { ok: true, pages } or { ok: false, error }.
export function parsePageRange(input, pageCount) {
  const text = (input ?? '').trim();
  if (text === '' || /^all$/i.test(text)) {
    return { ok: true, pages: Array.from({ length: pageCount }, (_, i) => i) };
  }

  const pages = [];
  for (const rawPart of text.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = part.match(/^(\d+)?\s*(?:(-)\s*(\d+)?)?$/);
    if (!match || (!match[1] && !match[3])) {
      return { ok: false, error: `"${part}" isn't a page or range (try something like 1-3, 5).` };
    }
    const start = match[1] ? Number(match[1]) : 1;
    const end = match[2] ? (match[3] ? Number(match[3]) : pageCount) : start;
    for (const page of [start, end]) {
      if (page < 1 || page > pageCount) {
        return { ok: false, error: `Page ${page} doesn't exist - this PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.` };
      }
    }
    const step = end >= start ? 1 : -1;
    for (let page = start; page !== end + step; page += step) pages.push(page - 1);
  }
  if (pages.length === 0) return { ok: false, error: 'No pages selected.' };
  return { ok: true, pages };
}

// Moves the item at `from` to `to`, returning a new array.
export function reorder(items, from, to) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Builds the merged PDF from [{ bytes, pages }] in order, where `pages` is
// a list of 0-based page indices. `onProgress(done, total)` is called
// after each file. Returns a Blob.
export async function mergePdfs(parts, onProgress) {
  const { PDFDocument } = await loadPdfLib();
  const merged = await PDFDocument.create();
  for (let i = 0; i < parts.length; i++) {
    const source = await PDFDocument.load(parts[i].bytes);
    const copied = await merged.copyPages(source, parts[i].pages);
    for (const page of copied) merged.addPage(page);
    if (onProgress) onProgress(i + 1, parts.length);
  }
  const bytes = await merged.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
