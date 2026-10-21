// Copies pdf.js's support files from node_modules into public/pdfjs/ so the
// site serves them itself (same reason Tesseract's engine lives in
// public/tesseract/: the tools work without any third-party CDN).
//
// pdf.js fetches these on demand while rendering a PDF:
//   cmaps/          character maps - needed for Chinese/Japanese/Korean text
//   standard_fonts/ the 14 "standard" PDF fonts, for PDFs that don't embed them
//   wasm/           decoders for JPEG 2000 and JBIG2 images (common in scans)
//   iccs/           colour profile for CMYK images
//
// Run automatically before `npm run dev` and `npm run build` (see the
// "predev"/"prebuild" scripts in package.json). The output is gitignored -
// copying from node_modules keeps it in lockstep with the installed
// pdfjs-dist version instead of a vendored copy drifting out of date.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'pdfjs-dist');
const target = join(root, 'public', 'pdfjs');

if (!existsSync(source)) {
  console.error('copy-pdfjs-assets: pdfjs-dist is not installed - run npm install first.');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(source, folder), join(target, folder), { recursive: true });
}
console.log('copy-pdfjs-assets: copied pdf.js support files to public/pdfjs/');
