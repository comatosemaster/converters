// Shared loader for pdf.js (Mozilla's PDF renderer), used by the PDF tools.
//
// pdf.js is large, so it's only imported when a PDF tool actually opens a
// file - never as part of the main site bundle, and never during the
// build's server-side prerender (it expects browser APIs like DOMMatrix,
// which don't exist in Node).

let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      // `?url` makes Vite emit the worker as its own file and hand back its
      // URL. pdf.js parses PDFs in this background worker so big files
      // don't freeze the page.
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// Opens a PDF from raw bytes. Rejects with an error whose `name` is
// 'PasswordException' when the file needs a (different) password.
export async function openPdf(bytes, password) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    // pdf.js takes ownership of (detaches) the buffer it's given; a copy
    // keeps the caller's bytes usable for a retry with a password.
    data: bytes.slice(0),
    password,
    // Self-hosted support files - see scripts/copy-pdfjs-assets.js.
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
  });
  return task.promise;
}

// Releases an open PDF and its worker resources. (pdf.js 6 moved this from
// the document object to the task that loaded it.) Safe to call twice.
export function closePdf(pdf) {
  pdf?.loadingTask?.destroy();
}

// Draws one page (1-based) onto a new canvas. `scale` 1 = 72 DPI, the PDF's
// own unit; 150 DPI is scale 150 / 72. `background` fills the page first,
// because PDF pages are transparent unless they paint their own backdrop.
export async function renderPage(pdf, pageNumber, scale, background = '#ffffff') {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}

// Page size in PDF points (1/72 inch), as displayed - rotation applied.
export async function pageSize(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  return { width, height };
}
