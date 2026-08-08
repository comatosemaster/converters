// -----------------------------------------------------------------------
// WATERMARK REMOVAL LOGIC - no React, no DOM assumptions beyond the
// Canvas API's typed pixel arrays. Kept separate from WatermarkRemover.jsx
// so file validation, sizing, and the actual removal algorithm can be
// read (or reused) independently of the UI, matching the pattern used by
// imageFlipUtils.js and imageColorPickerUtils.js.
//
// REMOVAL APPROACH: this is a PDE-style diffusion inpaint (the selected
// region is treated as an unknown that has to satisfy the Laplace
// equation given its known neighbors, solved with Gauss-Seidel
// relaxation), run coarse-to-fine over a small image pyramid so it
// converges in a bounded number of passes regardless of selection size.
// It is NOT texture-aware and NOT an AI model - it blends surrounding
// colors/gradients inward, which reconstructs flat or gently-varying
// backgrounds convincingly but will visibly smear a busy or textured
// area. That tradeoff is what keeps this dependency-free and fast enough
// to run synchronously in the browser.
// -----------------------------------------------------------------------

export const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Matches the cap used by the other image tools (see imageFlipUtils.js) -
// past this, decoding is what stops being safe to do on a web page.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// The working/download canvas is capped at this many pixels on the
// longest side. Generous enough that ordinary photos and screenshots are
// processed and downloaded at their exact original resolution; only
// extreme uploads (e.g. raw camera panoramas) get scaled down, which is
// what keeps memory use bounded instead of allocating an unbounded
// canvas + several same-sized typed arrays for the inpaint math.
export const MAX_CANVAS_DIMENSION = 4000;

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
// neither side exceeds MAX_CANVAS_DIMENSION. Only ever shrinks, never
// enlarges - most uploads pass through unchanged.
export function computeCanvasSize(naturalWidth, naturalHeight) {
  const scale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(naturalWidth, naturalHeight));
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
    scale,
  };
}

export function buildDownloadName(originalName, mime) {
  const base = originalName.replace(/\.[^./]+$/, '');
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  return `${base}-watermark-removed.${extension}`;
}

// --- Selection bounds ------------------------------------------------------

// Grows an existing { minX, minY, maxX, maxY } bounds rect (or null) to
// include a brush stamp centered at (x, y) with the given radius, clamped
// to the canvas. Tracking this incrementally while the user paints avoids
// ever having to scan the whole mask canvas to find out what was
// selected.
export function growSelectionBounds(bounds, x, y, radius, width, height) {
  const minX = Math.max(0, Math.floor(x - radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxX = Math.min(width - 1, Math.ceil(x + radius));
  const maxY = Math.min(height - 1, Math.ceil(y + radius));
  if (!bounds) return { minX, minY, maxX, maxY };
  return {
    minX: Math.min(bounds.minX, minX),
    minY: Math.min(bounds.minY, minY),
    maxX: Math.max(bounds.maxX, maxX),
    maxY: Math.max(bounds.maxY, maxY),
  };
}

// Expands a selection-bounds rect by `padding` extra pixels on every
// side (clamped to the canvas) - the inpaint needs real surrounding
// pixels to draw from, not just the mask's own edge.
export function padBounds(bounds, padding, width, height) {
  return {
    x: Math.max(0, bounds.minX - padding),
    y: Math.max(0, bounds.minY - padding),
    maxX: Math.min(width - 1, bounds.maxX + padding),
    maxY: Math.min(height - 1, bounds.maxY + padding),
  };
}

// --- Inpainting -------------------------------------------------------------

const MIN_PYRAMID_DIMENSION = 24;
const MAX_PYRAMID_LEVELS = 6;
const COARSEST_ITERATIONS = 60;
const FINEST_ITERATIONS = 12;
const MID_ITERATIONS = 20;

// Downsamples a { color, mask, width, height } level by 2x. Masked source
// pixels are excluded from the color average (their value is meaningless
// noise, not information) - a coarse pixel only stays "known" if at least
// one of its four source pixels was known; if all four were masked, the
// coarse pixel is masked too, propagating the hole upward.
function downsampleLevel(level) {
  const { color, mask, width, height } = level;
  const nextWidth = Math.ceil(width / 2);
  const nextHeight = Math.ceil(height / 2);
  const nextColor = new Float32Array(nextWidth * nextHeight * 3);
  const nextMask = new Uint8Array(nextWidth * nextHeight);

  for (let y = 0; y < nextHeight; y++) {
    for (let x = 0; x < nextWidth; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let known = 0;
      let sampled = 0;

      for (let dy = 0; dy < 2; dy++) {
        const sy = y * 2 + dy;
        if (sy >= height) continue;
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          if (sx >= width) continue;
          sampled++;
          const sIndex = sy * width + sx;
          if (mask[sIndex]) continue;
          const cIndex = sIndex * 3;
          r += color[cIndex];
          g += color[cIndex + 1];
          b += color[cIndex + 2];
          known++;
        }
      }

      const outIndex = y * nextWidth + x;
      if (known > 0) {
        nextColor[outIndex * 3] = r / known;
        nextColor[outIndex * 3 + 1] = g / known;
        nextColor[outIndex * 3 + 2] = b / known;
      }
      nextMask[outIndex] = known === 0 && sampled > 0 ? 1 : 0;
    }
  }

  return { color: nextColor, mask: nextMask, width: nextWidth, height: nextHeight };
}

// Seeds every masked pixel with the average color of all currently-known
// pixels in the level - a flat but reasonable starting guess for the
// relaxation below to refine, instead of starting from black.
function seedWithGlobalAverage(level) {
  const { color, mask, width, height } = level;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < width * height; i++) {
    if (mask[i]) continue;
    r += color[i * 3];
    g += color[i * 3 + 1];
    b += color[i * 3 + 2];
    count++;
  }
  if (count === 0) return; // the whole level is masked - nothing to seed from
  const avgR = r / count;
  const avgG = g / count;
  const avgB = b / count;
  for (let i = 0; i < width * height; i++) {
    if (!mask[i]) continue;
    color[i * 3] = avgR;
    color[i * 3 + 1] = avgG;
    color[i * 3 + 2] = avgB;
  }
}

// Copies each masked pixel's color down from its corresponding pixel in
// the coarser level (nearest-neighbor) - this is what carries a level's
// solution down as the starting point for the next, finer level. Known
// (unmasked) pixels are left untouched, since their true value is real
// image data.
function seedFromCoarserLevel(fine, coarse) {
  for (let y = 0; y < fine.height; y++) {
    const cy = Math.min(coarse.height - 1, y >> 1);
    for (let x = 0; x < fine.width; x++) {
      const index = y * fine.width + x;
      if (!fine.mask[index]) continue;
      const cx = Math.min(coarse.width - 1, x >> 1);
      const cIndex = (cy * coarse.width + cx) * 3;
      fine.color[index * 3] = coarse.color[cIndex];
      fine.color[index * 3 + 1] = coarse.color[cIndex + 1];
      fine.color[index * 3 + 2] = coarse.color[cIndex + 2];
    }
  }
}

// Gauss-Seidel relaxation: each masked pixel becomes the average of its
// up/down/left/right neighbors (whichever exist), in place, repeated for
// `iterations` passes. Using each neighbor's already-updated value in the
// same pass (rather than the previous pass's snapshot) converges roughly
// twice as fast as plain Jacobi averaging.
function relax(level, iterations) {
  const { color, mask, width, height } = level;
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let y = 0; y < height; y++) {
      const rowStart = y * width;
      for (let x = 0; x < width; x++) {
        const index = rowStart + x;
        if (!mask[index]) continue;

        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        if (x > 0) {
          const n = (index - 1) * 3;
          r += color[n]; g += color[n + 1]; b += color[n + 2]; count++;
        }
        if (x < width - 1) {
          const n = (index + 1) * 3;
          r += color[n]; g += color[n + 1]; b += color[n + 2]; count++;
        }
        if (y > 0) {
          const n = (index - width) * 3;
          r += color[n]; g += color[n + 1]; b += color[n + 2]; count++;
        }
        if (y < height - 1) {
          const n = (index + width) * 3;
          r += color[n]; g += color[n + 1]; b += color[n + 2]; count++;
        }
        if (count === 0) continue;

        const cIndex = index * 3;
        color[cIndex] = r / count;
        color[cIndex + 1] = g / count;
        color[cIndex + 2] = b / count;
      }
    }
  }
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Fills the masked pixels of a `width`x`height` region using the pixels
 * around them. `rgba` and `maskAlpha` are Uint8ClampedArray-like pixel
 * buffers (RGBA, one byte per channel) for that same region - `maskAlpha`
 * only needs its alpha channel to be meaningful (alpha > threshold means
 * "selected for removal").
 *
 * Returns a new Uint8ClampedArray of the same shape with masked pixels
 * replaced and every other pixel byte-for-byte unchanged. `onProgress`
 * (optional) is called with a 0-1 fraction between pyramid levels, and
 * this function yields to the browser between levels so a "Processing…"
 * state has a chance to actually paint instead of the whole removal
 * happening in one blocking frame.
 */
export async function inpaintRegion(rgba, maskAlpha, width, height, { onProgress } = {}) {
  const pixelCount = width * height;
  const color = new Float32Array(pixelCount * 3);
  const mask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    color[i * 3] = rgba[i * 4];
    color[i * 3 + 1] = rgba[i * 4 + 1];
    color[i * 3 + 2] = rgba[i * 4 + 2];
    mask[i] = maskAlpha[i * 4 + 3] > 10 ? 1 : 0;
  }

  const levels = [{ color, mask, width, height }];
  while (
    levels.length < MAX_PYRAMID_LEVELS &&
    levels[levels.length - 1].width > MIN_PYRAMID_DIMENSION &&
    levels[levels.length - 1].height > MIN_PYRAMID_DIMENSION
  ) {
    levels.push(downsampleLevel(levels[levels.length - 1]));
  }

  const coarsest = levels[levels.length - 1];
  seedWithGlobalAverage(coarsest);
  relax(coarsest, COARSEST_ITERATIONS);
  if (onProgress) onProgress(1 / levels.length);
  await nextFrame();

  for (let i = levels.length - 2; i >= 0; i--) {
    const fine = levels[i];
    const coarse = levels[i + 1];
    seedFromCoarserLevel(fine, coarse);
    relax(fine, i === 0 ? FINEST_ITERATIONS : MID_ITERATIONS);
    if (onProgress) onProgress((levels.length - i) / levels.length);
    await nextFrame();
  }

  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  for (let i = 0; i < pixelCount; i++) {
    if (!mask[i]) continue;
    out[i * 4] = Math.round(color[i * 3]);
    out[i * 4 + 1] = Math.round(color[i * 3 + 1]);
    out[i * 4 + 2] = Math.round(color[i * 3 + 2]);
  }
  return out;
}
