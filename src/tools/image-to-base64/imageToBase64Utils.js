// -----------------------------------------------------------------------
// IMAGE <-> BASE64 LOGIC — no React, no UI. Kept separate from
// ImageToBase64.jsx so the conversion/validation logic can be read (or
// reused) completely independently of the component.
// -----------------------------------------------------------------------

const SUPPORTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
];

// A generous but real ceiling. Encoding to Base64 means holding the
// original file AND a ~33%-bigger text copy of it in memory at once —
// past a certain size that stops being safe to do on a web page. 25MB
// comfortably covers normal photos/graphics while still catching the
// rare huge file that would make the tab hang.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Checks a File before we try to do anything with it. Returns
// `{ ok: true }` or `{ ok: false, error }` — never throws.
export function validateImage(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `That file is too large to convert safely (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).`,
    };
  }

  const looksSupported =
    SUPPORTED_TYPES.includes(file.type) || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);
  if (!looksSupported) {
    return {
      ok: false,
      error: 'Unsupported file type — please choose a PNG, JPG, WebP, GIF, BMP, or SVG image.',
    };
  }

  return { ok: true, error: '' };
}

// Reads a File as a Data URI. FileReader's own output already IS Base64
// (with a "data:<mime>;base64," prefix) — the browser does the encoding
// for us, so there's no need to hand-roll one.
export function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// Loads a Data URI into an <img> just to confirm the browser can actually
// decode it (catches corrupted files that read fine as bytes but aren't a
// real image) and to read its pixel dimensions.
export function readImageDimensions(dataUri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not decode this file as an image.'));
    img.src = dataUri;
  });
}

// Splits a Data URI ("data:image/png;base64,AAAA...") into just the raw
// Base64 payload after the comma.
export function imageToBase64(dataUri) {
  const commaIndex = dataUri.indexOf(',');
  return commaIndex === -1 ? dataUri : dataUri.slice(commaIndex + 1);
}

// Rebuilds a full Data URI from a raw Base64 string and a mime type — the
// inverse of imageToBase64().
export function createDataUri(base64, mimeType) {
  return `data:${mimeType};base64,${base64}`;
}

// Base64 encodes every 3 bytes as 4 characters, so the encoded text is
// about 4/3 the size of the original — this estimates that without
// actually re-encoding anything.
export function calculateBase64Size(originalBytes) {
  return Math.ceil(originalBytes / 3) * 4;
}
