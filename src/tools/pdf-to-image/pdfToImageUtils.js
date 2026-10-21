// -----------------------------------------------------------------------
// PDF TO IMAGE LOGIC - no React. Kept separate from PdfToImage.jsx so the
// options, naming and rendering steps can be read independently of the UI.
// Rendering itself is done by pdf.js (see src/utils/pdfjs.js).
// -----------------------------------------------------------------------

import { renderPage, pageSize } from '../../utils/pdfjs.js';

export const FORMATS = [
  { mime: 'image/png', label: 'PNG', extension: 'png', hint: 'Sharpest text, larger files' },
  { mime: 'image/jpeg', label: 'JPG', extension: 'jpg', hint: 'Smaller files, best for photos' },
  { mime: 'image/webp', label: 'WebP', extension: 'webp', hint: 'Small and sharp, modern browsers' },
];
export const FORMAT_BY_MIME = Object.fromEntries(FORMATS.map((f) => [f.mime, f]));

// PDF pages are measured in points (1/72 inch), so DPI / 72 is the
// rendering scale.
export const RESOLUTIONS = [
  { dpi: 72, label: '72 DPI - screen, smallest files' },
  { dpi: 150, label: '150 DPI - sharp on screen (recommended)' },
  { dpi: 300, label: '300 DPI - print quality' },
];

const MAX_FILE_SIZE = 100 * 1024 * 1024;
// Above this many pixels a single canvas gets risky (browsers cap canvas
// size, and phones run out of memory) - such pages are rendered smaller.
const MAX_PAGE_PIXELS = 36_000_000;

export function validatePdfFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `That PDF is too large to convert in the browser (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).` };
  }
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return { ok: false, error: 'Please choose a PDF file.' };
  }
  return { ok: true, error: '' };
}

// Renders one page (1-based) to an image Blob. Returns
// { blob, width, height, reduced } - `reduced` is true when the page was
// too big for the chosen DPI and was rendered at a lower one instead.
export async function renderPageToBlob(pdf, pageNumber, dpi, mime) {
  const size = await pageSize(pdf, pageNumber);
  let scale = dpi / 72;
  const pixels = size.width * scale * size.height * scale;
  const reduced = pixels > MAX_PAGE_PIXELS;
  if (reduced) scale *= Math.sqrt(MAX_PAGE_PIXELS / pixels);

  const canvas = await renderPage(pdf, pageNumber, scale);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Your browser couldn't create this image."))),
      mime,
      mime === 'image/png' ? undefined : 0.92,
    );
  });
  const result = { blob, width: canvas.width, height: canvas.height, reduced };
  // Free the pixel buffer right away - with many pages these add up fast.
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

export function baseName(fileName) {
  return fileName.replace(/\.[^./]+$/, '') || 'document';
}

export function pageFileName(fileName, pageNumber, mime) {
  return `${baseName(fileName)}-page-${pageNumber}.${FORMAT_BY_MIME[mime]?.extension ?? 'png'}`;
}

// Bundles every page image into one ZIP. jszip is loaded only when needed.
export async function buildZip(fileName, pages) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const page of pages) zip.file(page.name, page.blob);
  // Images are already compressed; "STORE" skips a slow, pointless second pass.
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
