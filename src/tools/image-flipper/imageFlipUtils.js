// -----------------------------------------------------------------------
// IMAGE FLIP LOGIC - no React, no UI. Kept separate from ImageFlipper.jsx
// so the validation/flip logic can be read (or reused) independently of
// the component, matching the pattern used by imageToBase64Utils.js.
// -----------------------------------------------------------------------

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// A generous but real ceiling - past this, decoding and redrawing onto a
// canvas stops being something a browser tab can do smoothly.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Canvas dimensions are capped by the browser (varies by engine, but
// tens of millions of pixels is a safe practical limit everywhere) - past
// this, `getContext('2d')` operations can silently fail or the tab can
// hang trying to allocate the backing buffer.
const MAX_PIXELS = 40_000_000;

export const FORMATS = [
  { mime: 'image/png', label: 'PNG', extension: 'png', lossy: false },
  { mime: 'image/jpeg', label: 'JPG', extension: 'jpg', lossy: true },
  { mime: 'image/webp', label: 'WebP', extension: 'webp', lossy: true },
];

export const FORMAT_BY_MIME = Object.fromEntries(FORMATS.map((f) => [f.mime, f]));
export const DEFAULT_FORMAT = 'image/png';

// Checks a File before we try to do anything with it. Returns
// `{ ok: true }` or `{ ok: false, error }` - never throws.
export function validateImageFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `That file is too large to flip safely (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).`,
    };
  }

  const looksSupported =
    SUPPORTED_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!looksSupported) {
    return { ok: false, error: 'Unsupported file type - please choose a PNG, JPG, or WebP image.' };
  }

  return { ok: true, error: '' };
}

// A second check, run once the image has actually decoded and its real
// pixel dimensions are known (file size alone doesn't predict this - a
// heavily compressed JPEG can still decode to a huge canvas).
export function validateImageDimensions(width, height) {
  if (width * height > MAX_PIXELS) {
    const megapixels = Math.round((width * height) / 1_000_000);
    return {
      ok: false,
      error: `This image is ${width}×${height} (~${megapixels} megapixels) - too large to flip reliably in the browser. Try a smaller image.`,
    };
  }
  return { ok: true, error: '' };
}

// Draws `img` onto a canvas flipped horizontally and/or vertically, then
// exports it as a Blob in the requested format. Flipping is done with a
// translate+scale(-1) transform rather than pixel manipulation - the
// canvas draws the same image, just mirrored, which is both simpler and
// far faster than touching individual pixels.
export function flipImage(img, { flipHorizontal, flipVertical }, mime) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');

    if (mime === 'image/jpeg') {
      // JPEG has no transparency channel - fill white first so
      // transparent areas don't turn black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    // Moving the origin to the far edge before scaling by -1 on that axis
    // is what makes the flip happen around the canvas's own center,
    // instead of drawing the image off-screen in the wrong direction.
    ctx.translate(flipHorizontal ? canvas.width : 0, flipVertical ? canvas.height : 0);
    ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Your browser couldn't create this image."));
          return;
        }
        resolve(blob);
      },
      mime,
      mime === 'image/png' ? undefined : 0.92,
    );
  });
}

export function buildDownloadName(originalName, mime) {
  const base = originalName.replace(/\.[^./]+$/, ''); // strip the original extension
  const extension = FORMAT_BY_MIME[mime]?.extension ?? 'bin';
  return `${base}-flipped.${extension}`;
}
