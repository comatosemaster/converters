// -----------------------------------------------------------------------
// IMAGE COLOR PICKER LOGIC - no React, no UI. Kept separate from
// ImageColorPicker.jsx so validation and sizing math can be read (or
// reused) independently of the component.
//
// Reading the actual pixel color is inherently tied to a live <canvas> in
// the DOM (mapping a pointer event to a backing-store pixel), so that part
// stays in the component, matching how image-flipper's canvas drawing
// works. Turning that {r,g,b} into HEX/RGB/HSL text reuses
// colorConversions.js directly rather than re-implementing color math
// that already exists on this site.
// -----------------------------------------------------------------------

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Matches the cap used by the other image tools (see imageFlipUtils.js) -
// past this, decoding is what stops being safe to do on a web page.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// The canvas backing store is capped at this many pixels on the longest
// side. Picking a color doesn't need the image at full camera resolution
// (a 40-megapixel photo has no more distinguishable color information for
// this purpose than the same photo at 1600px), and capping it is what
// keeps memory use sane for a very large upload instead of allocating a
// full-resolution canvas and ImageData buffer for it.
export const MAX_CANVAS_DIMENSION = 1600;

export function validateImageFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `That file is too large to open safely (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).`,
    };
  }

  const looksSupported =
    SUPPORTED_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!looksSupported) {
    return { ok: false, error: 'Unsupported file type - please choose a PNG, JPG, or WebP image.' };
  }

  return { ok: true, error: '' };
}

// Scales `naturalWidth`/`naturalHeight` down (preserving aspect ratio) so
// neither side exceeds MAX_CANVAS_DIMENSION. Images already smaller than
// the cap are returned unchanged - this only ever shrinks, never enlarges.
export function computeCanvasSize(naturalWidth, naturalHeight) {
  const scale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(naturalWidth, naturalHeight));
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
    scale,
  };
}

// Maps a pointer event's page-relative position to a pixel coordinate on
// the canvas's own backing store - necessary because the canvas is
// displayed at a CSS size (via max-width: 100%) that's often different
// from its actual width/height attributes.
export function pointerToCanvasPixel(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor((clientX - rect.left) * scaleX);
  const y = Math.floor((clientY - rect.top) * scaleY);
  return {
    x: Math.min(Math.max(x, 0), canvas.width - 1),
    y: Math.min(Math.max(y, 0), canvas.height - 1),
  };
}
