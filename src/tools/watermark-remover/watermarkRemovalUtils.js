// -----------------------------------------------------------------------
// WATERMARK REMOVAL LOGIC - no React, no DOM assumptions beyond the
// Canvas API's typed pixel arrays. Kept separate from WatermarkRemover.jsx
// so file validation, sizing, and the actual removal algorithm can be
// read (or reused) independently of the UI, matching the pattern used by
// imageFlipUtils.js and imageColorPickerUtils.js.
//
// REMOVAL APPROACH: content-aware fill. The selected area is rebuilt from
// texture copied out of the surrounding image (patch matching, see the
// "Patch-based fill" section below), working coarse-to-fine over a small
// image pyramid. A PDE-style diffusion fill (each unknown pixel relaxed
// towards the average of its neighbours) provides the starting guess at
// the coarsest level. It is NOT an AI model - it can only reuse what's
// already in the picture, so it works best when similar background exists
// near the watermark, and can't invent something (like a face) that the
// watermark completely hid.
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

// Patches need room to describe local structure: below this size a 7x7
// patch covers so much of the picture that matches become meaningless
// (sky got filled with grass in testing).
const MIN_PYRAMID_DIMENSION = 64;
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

// --- Patch-based (content-aware) fill ---------------------------------------
//
// Diffusion alone (above) blends the surrounding colors inward. On a flat
// background that's perfect, but on anything with texture - grass, fabric,
// wood, skin, sky noise, a photo's grain - it leaves a smooth, blurry
// "stain" exactly where the watermark was, which the eye picks out at once.
//
// So diffusion is only the starting guess. The real fill copies texture
// from the rest of the image: every small square "patch" that overlaps the
// hole is matched to the most similar patch of untouched image nearby
// (comparing the parts that are known, and the current guess for the rest),
// and each hole pixel becomes a blend of what those matches say belongs
// there. Repeating match -> blend a few times makes the patches agree with
// each other, and doing it coarse-to-fine (small image first, then larger)
// gets the big structure right before the fine detail. This is the
// approach behind "content-aware fill" in photo editors (Wexler et al.'s
// space-time completion, with Barnes et al.'s PatchMatch to find matches
// quickly instead of comparing every patch to every other patch).

const PATCH_RADIUS = 3; // 7x7 patches
// Above this many pixels to fill at full size, the final level does less
// work - a huge selection would otherwise take many seconds.
const LARGE_HOLE_PIXELS = 300_000;

// Small deterministic random generator, so the same selection on the same
// image always gives the same result.
function makeRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

// Like downsampleLevel(), except a coarse pixel counts as part of the hole
// if ANY of its four source pixels was. Patches copied at a coarse level
// must contain only genuinely untouched image, never a watermark blend.
function downsampleStrict(level) {
  const next = downsampleLevel(level);
  const { mask, width, height } = level;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) next.mask[(y >> 1) * next.width + (x >> 1)] = 1;
    }
  }
  return next;
}

// Grows the hole by `radius` pixels in every direction.
function dilateMask(mask, width, height, radius) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width) out[yy * width + xx] = 1;
        }
      }
    }
  }
  return out;
}

// Centres of patches that lie entirely inside the image and entirely
// outside the hole - the only places texture may be copied from. Uses a
// summed-area table so each check is four lookups, not a 7x7 scan.
function findSourceCentres(level, r) {
  const { mask, width, height } = level;
  const stride = width + 1;
  const sums = new Int32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += mask[y * width + x];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const valid = new Uint8Array(width * height);
  const list = [];
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      const x0 = x - r;
      const y0 = y - r;
      const x1 = x + r + 1;
      const y1 = y + r + 1;
      const holes = sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
      if (holes === 0) {
        valid[y * width + x] = 1;
        list.push(y * width + x);
      }
    }
  }
  return { valid, list };
}

// Every pixel whose patch overlaps the hole - the patches whose matches
// decide the fill. Also returns a pixel -> target lookup, so a target's
// neighbours can be found.
function findTargets(level, r) {
  const { mask, width, height } = level;
  const near = dilateMask(mask, width, height, r);
  const list = [];
  const indexOf = new Int32Array(width * height).fill(-1);
  for (let p = 0; p < width * height; p++) {
    if (!near[p]) continue;
    indexOf[p] = list.length;
    list.push(p);
  }
  return { list: Int32Array.from(list), indexOf };
}

// Mean squared colour difference between the patch around target pixel
// (tx, ty) and the patch around source pixel (sx, sy). Target pixels that
// fall outside the image are skipped. Gives up early, returning Infinity,
// once it's clearly worse than `limit`.
function patchDistance(level, tx, ty, sx, sy, r, limit) {
  const { color, width, height } = level;
  const budget = limit * (2 * r + 1) * (2 * r + 1);
  let sum = 0;
  let count = 0;
  for (let dy = -r; dy <= r; dy++) {
    const y = ty + dy;
    if (y < 0 || y >= height) continue;
    const sourceRow = (sy + dy) * width + sx;
    for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx;
      if (x < 0 || x >= width) continue;
      const a = (y * width + x) * 3;
      const b = (sourceRow + dx) * 3;
      const d0 = color[a] - color[b];
      const d1 = color[a + 1] - color[b + 1];
      const d2 = color[a + 2] - color[b + 2];
      sum += d0 * d0 + d1 * d1 + d2 * d2;
      count++;
    }
    if (sum > budget) return Infinity;
  }
  return count ? sum / count : Infinity;
}

// One round of PatchMatch: improves every target's match by trying its
// neighbours' matches (good matches tend to sit next to each other, so a
// good one spreads quickly) and then random guesses at shrinking distances
// around its current match.
function improveMatches(level, targets, sources, field, r, random, reverse) {
  const { width, height } = level;
  const { list, indexOf } = targets;
  const { match, distance } = field;
  const step = reverse ? -1 : 1;

  const consider = (i, tx, ty, sx, sy) => {
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;
    const s = sy * width + sx;
    if (!sources.valid[s] || s === match[i]) return;
    const d = patchDistance(level, tx, ty, sx, sy, r, distance[i]);
    if (d < distance[i]) {
      distance[i] = d;
      match[i] = s;
    }
  };

  for (let k = 0; k < list.length; k++) {
    const i = reverse ? list.length - 1 - k : k;
    const t = list[i];
    const tx = t % width;
    const ty = (t / width) | 0;

    // Propagation from the previous pixel in scan order, shifted by one.
    const nx = tx - step;
    if (nx >= 0 && nx < width) {
      const n = indexOf[t - step];
      if (n >= 0) consider(i, tx, ty, (match[n] % width) + step, (match[n] / width) | 0);
    }
    const ny = ty - step;
    if (ny >= 0 && ny < height) {
      const n = indexOf[t - step * width];
      if (n >= 0) consider(i, tx, ty, match[n] % width, ((match[n] / width) | 0) + step);
    }

    // Random search around the current best, halving the radius each time.
    const bx = match[i] % width;
    const by = (match[i] / width) | 0;
    for (let radius = Math.max(width, height); radius >= 1; radius >>= 1) {
      consider(
        i,
        tx,
        ty,
        Math.round(bx + (random() * 2 - 1) * radius),
        Math.round(by + (random() * 2 - 1) * radius),
      );
    }
  }
}

// Rebuilds every hole pixel as a weighted blend of what each overlapping
// patch's match says belongs there. Better matches get much more say,
// which keeps the fill sharp instead of an average of many guesses.
function vote(level, targets, field, r) {
  const { color, mask, width, height } = level;
  const { match, distance } = field;
  const finite = Array.from(distance).filter(Number.isFinite).sort((a, b) => a - b);
  const typical = Math.max(1, finite.length ? finite[Math.floor(finite.length / 2)] : 1);
  const accum = new Float32Array(width * height * 3);
  const weights = new Float32Array(width * height);

  for (let i = 0; i < targets.list.length; i++) {
    if (!Number.isFinite(distance[i])) continue;
    const t = targets.list[i];
    const tx = t % width;
    const ty = (t / width) | 0;
    const sx = match[i] % width;
    const sy = (match[i] / width) | 0;
    const weight = Math.exp(-distance[i] / (2 * typical));
    for (let dy = -r; dy <= r; dy++) {
      const y = ty + dy;
      if (y < 0 || y >= height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = tx + dx;
        if (x < 0 || x >= width) continue;
        const p = y * width + x;
        if (!mask[p]) continue;
        const q = ((sy + dy) * width + sx + dx) * 3;
        accum[p * 3] += weight * color[q];
        accum[p * 3 + 1] += weight * color[q + 1];
        accum[p * 3 + 2] += weight * color[q + 2];
        weights[p] += weight;
      }
    }
  }

  for (let p = 0; p < width * height; p++) {
    if (!mask[p] || weights[p] === 0) continue;
    color[p * 3] = accum[p * 3] / weights[p];
    color[p * 3 + 1] = accum[p * 3 + 1] / weights[p];
    color[p * 3 + 2] = accum[p * 3 + 2] / weights[p];
  }
}

// Starting matches for a level: scaled up from the coarser level's
// matches where possible (they already know roughly where the right
// texture is), random otherwise.
function initialMatches(level, targets, sources, r, random, coarser) {
  const { width } = level;
  const count = targets.list.length;
  const match = new Int32Array(count);
  const distance = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = targets.list[i];
    const tx = t % width;
    const ty = (t / width) | 0;
    let s = -1;
    if (coarser) {
      const c = coarser.targets.indexOf[(ty >> 1) * coarser.width + (tx >> 1)];
      if (c >= 0) {
        const cs = coarser.field.match[c];
        const sx = (cs % coarser.width) * 2 + (tx & 1);
        const sy = ((cs / coarser.width) | 0) * 2 + (ty & 1);
        if (sx < level.width && sy < level.height && sources.valid[sy * width + sx]) s = sy * width + sx;
      }
    }
    if (s < 0) s = sources.list[Math.floor(random() * sources.list.length)];
    match[i] = s;
    distance[i] = patchDistance(level, tx, ty, s % width, (s / width) | 0, r, Infinity);
  }
  return { match, distance };
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
  const painted = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    color[i * 3] = rgba[i * 4];
    color[i * 3 + 1] = rgba[i * 4 + 1];
    color[i * 3 + 2] = rgba[i * 4 + 2];
    painted[i] = maskAlpha[i * 4 + 3] > 10 ? 1 : 0;
  }
  // Grow the selection by a pixel: brushing tends to stop right at the
  // watermark's edge, and its faint anti-aliased fringe left just outside
  // the selection would survive as a visible outline.
  const mask = dilateMask(painted, width, height, 1);

  const levels = [{ color, mask, width, height }];
  while (
    levels.length < MAX_PYRAMID_LEVELS &&
    levels[levels.length - 1].width > MIN_PYRAMID_DIMENSION &&
    levels[levels.length - 1].height > MIN_PYRAMID_DIMENSION
  ) {
    levels.push(downsampleStrict(levels[levels.length - 1]));
  }

  // Starting guess at the coarsest level: smooth diffusion fill.
  const coarsest = levels[levels.length - 1];
  seedWithGlobalAverage(coarsest);
  relax(coarsest, COARSEST_ITERATIONS);

  const random = makeRandom(width * 73856093 + height * 19349663);
  const r = PATCH_RADIUS;
  let coarser = null;
  for (let i = levels.length - 1; i >= 0; i--) {
    const level = levels[i];
    if (i < levels.length - 1) seedFromCoarserLevel(level, levels[i + 1]);

    const sources = findSourceCentres(level, r);
    if (!sources.list.length) {
      // Nowhere clean to copy texture from at this size - fall back to
      // diffusion for this level and let the finer levels try again.
      relax(level, i === 0 ? FINEST_ITERATIONS : MID_ITERATIONS);
      coarser = null;
    } else {
      const targets = findTargets(level, r);
      const field = initialMatches(level, targets, sources, r, random, coarser);
      // More match/blend rounds where they're cheap (small coarse levels),
      // fewer at full size where each one costs the most.
      let rounds = i === levels.length - 1 ? 8 : 4;
      if (i === 0) rounds = targets.list.length > LARGE_HOLE_PIXELS ? 1 : 3;
      if (coarser) vote(level, targets, field, r);
      for (let round = 0; round < rounds; round++) {
        improveMatches(level, targets, sources, field, r, random, round % 2 === 1);
        vote(level, targets, field, r);
      }
      coarser = { width: level.width, targets, field };
    }

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
