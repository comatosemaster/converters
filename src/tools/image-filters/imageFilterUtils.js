// -----------------------------------------------------------------------
// IMAGE FILTER LOGIC - no React. One pixel pipeline used for BOTH the live
// preview (on a downscaled copy) and the full-resolution download, so what
// you see is exactly what you get. (CSS `filter` would be simpler for the
// preview, but its blur is measured in screen pixels - a blur that looks
// right on a small preview would be far too weak on the full-size image -
// and Safari doesn't support canvas filters for the export at all.)
// -----------------------------------------------------------------------

export const ADJUSTMENTS = [
  { id: 'brightness', label: 'Brightness', min: -100, max: 100, unit: '' },
  { id: 'contrast', label: 'Contrast', min: -100, max: 100, unit: '' },
  { id: 'saturation', label: 'Saturation', min: -100, max: 100, unit: '' },
  { id: 'warmth', label: 'Warmth', min: -100, max: 100, unit: '' },
  { id: 'hue', label: 'Hue', min: -180, max: 180, unit: '°' },
  { id: 'sharpen', label: 'Sharpen', min: 0, max: 100, unit: '' },
  { id: 'blur', label: 'Blur', min: 0, max: 100, unit: '' },
  { id: 'vignette', label: 'Vignette', min: 0, max: 100, unit: '' },
];

export const DEFAULT_SETTINGS = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  hue: 0,
  sharpen: 0,
  blur: 0,
  vignette: 0,
  grayscale: false,
  sepia: false,
  invert: false,
};

// One-click looks. Each is just a starting set of slider values the user
// can keep tweaking.
export const PRESETS = [
  { id: 'none', label: 'Original', settings: {} },
  { id: 'bw', label: 'Black & White', settings: { grayscale: true, contrast: 15 } },
  { id: 'sepia', label: 'Sepia', settings: { sepia: true, contrast: 5 } },
  { id: 'vintage', label: 'Vintage', settings: { sepia: true, saturation: -20, contrast: -10, brightness: 5, vignette: 45 } },
  { id: 'vivid', label: 'Vivid', settings: { saturation: 40, contrast: 15 } },
  { id: 'warm', label: 'Warm', settings: { warmth: 35, saturation: 10 } },
  { id: 'cool', label: 'Cool', settings: { warmth: -35, brightness: 5 } },
  { id: 'fade', label: 'Faded', settings: { contrast: -30, saturation: -30, brightness: 10 } },
  { id: 'drama', label: 'Dramatic', settings: { contrast: 45, saturation: -15, vignette: 55, sharpen: 30 } },
  { id: 'invert', label: 'Invert', settings: { invert: true } },
];

export function isDefault(settings) {
  return Object.keys(DEFAULT_SETTINGS).every((key) => settings[key] === DEFAULT_SETTINGS[key]);
}

// --- Colour: every colour adjustment is a 3x4 matrix ---------------------------
//
// out = M * [r, g, b, 1]. Brightness, contrast, saturation, hue, warmth,
// sepia, grayscale and invert are all of that form, so they're multiplied
// together once and applied to each pixel in a single pass.

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

// a then b (b applied to a's output).
function compose(a, b) {
  const out = new Array(12);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      let v = col === 3 ? b[row * 4 + 3] : 0;
      for (let k = 0; k < 3; k++) v += b[row * 4 + k] * a[k * 4 + col];
      out[row * 4 + col] = v;
    }
  }
  return out;
}

const fromRows = (r, g, b) => [...r, ...g, ...b];

// Luminance weights (Rec. 709), used by saturation and grayscale.
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

function saturationMatrix(s) {
  return fromRows(
    [LR + (1 - LR) * s, LG - LG * s, LB - LB * s, 0],
    [LR - LR * s, LG + (1 - LG) * s, LB - LB * s, 0],
    [LR - LR * s, LG - LG * s, LB + (1 - LB) * s, 0],
  );
}

// Rotation around the grey axis, as in the CSS/SVG hue-rotate filter.
function hueMatrix(degrees) {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return fromRows(
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0],
  );
}

export function colorMatrix(settings) {
  let m = IDENTITY;
  if (settings.brightness) {
    // +100 doubles brightness, -100 goes to black.
    const f = 1 + settings.brightness / 100;
    m = compose(m, fromRows([f, 0, 0, 0], [0, f, 0, 0], [0, 0, f, 0]));
  }
  if (settings.contrast) {
    // Stretch/squeeze around mid-grey (0.5). Positive values grow faster
    // so +100 is a strong but not absurd 3x.
    const c = settings.contrast > 0 ? 1 + (settings.contrast / 100) * 2 : 1 + settings.contrast / 100;
    const offset = 0.5 * (1 - c);
    m = compose(m, fromRows([c, 0, 0, offset], [0, c, 0, offset], [0, 0, c, offset]));
  }
  if (settings.saturation) {
    m = compose(m, saturationMatrix(1 + settings.saturation / 100));
  }
  if (settings.hue) {
    m = compose(m, hueMatrix(settings.hue));
  }
  if (settings.warmth) {
    // Warmer = more red/yellow and less blue; cooler the reverse.
    const w = settings.warmth / 100;
    m = compose(m, fromRows([1 + 0.12 * w, 0, 0, 0.03 * w], [0, 1 + 0.03 * w, 0, 0], [0, 0, 1 - 0.12 * w, -0.03 * w]));
  }
  if (settings.grayscale) m = compose(m, saturationMatrix(0));
  if (settings.sepia) {
    m = compose(m, fromRows([0.393, 0.769, 0.189, 0], [0.349, 0.686, 0.168, 0], [0.272, 0.534, 0.131, 0]));
  }
  if (settings.invert) m = compose(m, fromRows([-1, 0, 0, 1], [0, -1, 0, 1], [0, 0, -1, 1]));
  return m;
}

function applyColor(data, m) {
  if (m.every((v, i) => v === IDENTITY[i])) return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    // Uint8ClampedArray clamps to 0-255 and rounds for us.
    data[i] = (m[0] * r + m[1] * g + m[2] * b + m[3]) * 255;
    data[i + 1] = (m[4] * r + m[5] * g + m[6] * b + m[7]) * 255;
    data[i + 2] = (m[8] * r + m[9] * g + m[10] * b + m[11]) * 255;
  }
}

// --- Spatial: blur, sharpen, vignette ------------------------------------------

// One horizontal + vertical box-blur pass over the RGB channels (alpha is
// left alone). Three passes of this approximate a Gaussian blur closely.
function boxBlurPass(src, dst, width, height, radius) {
  const size = radius * 2 + 1;
  // Horizontal: src -> dst
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[(row + Math.min(width - 1, Math.max(0, k))) * 4 + c];
      for (let x = 0; x < width; x++) {
        dst[(row + x) * 4 + c] = sum / size;
        const out = Math.max(0, x - radius);
        const into = Math.min(width - 1, x + radius + 1);
        sum += src[(row + into) * 4 + c] - src[(row + out) * 4 + c];
      }
    }
  }
  // Vertical: dst -> src
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += dst[(Math.min(height - 1, Math.max(0, k)) * width + x) * 4 + c];
      for (let y = 0; y < height; y++) {
        src[(y * width + x) * 4 + c] = sum / size;
        const out = Math.max(0, y - radius);
        const into = Math.min(height - 1, y + radius + 1);
        sum += dst[(into * width + x) * 4 + c] - dst[(out * width + x) * 4 + c];
      }
    }
  }
}

function gaussianBlur(data, width, height, sigma) {
  // Box radius for 3 passes approximating a Gaussian of this sigma.
  const radius = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  const work = new Float32Array(data.length);
  const buffer = new Float32Array(data.length);
  work.set(data);
  for (let pass = 0; pass < 3; pass++) boxBlurPass(work, buffer, width, height, radius);
  return work;
}

function applyBlur(data, width, height, sigma) {
  const blurred = gaussianBlur(data, width, height, sigma);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = blurred[i];
    data[i + 1] = blurred[i + 1];
    data[i + 2] = blurred[i + 2];
  }
}

// Unsharp mask: push each pixel away from a slightly blurred version of
// itself, which exaggerates edges.
function applySharpen(data, width, height, amount, sigma) {
  const blurred = gaussianBlur(data, width, height, sigma);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) data[i + c] = data[i + c] + amount * (data[i + c] - blurred[i + c]);
  }
}

function applyVignette(data, width, height, strength) {
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
      // Untouched in the middle, darkening smoothly towards the corners.
      const t = Math.max(0, (d - 0.35) / 0.65);
      const f = 1 - strength * t * t;
      const i = (y * width + x) * 4;
      data[i] *= f;
      data[i + 1] *= f;
      data[i + 2] *= f;
    }
  }
}

/**
 * Applies `settings` to an ImageData in place. Blur, sharpen strength
 * and vignette are relative to the image's size, so a downscaled preview
 * and the full-size download look the same.
 */
export function applyFilters(imageData, settings) {
  const { data, width, height } = imageData;
  applyColor(data, colorMatrix(settings));
  const size = Math.max(width, height);
  if (settings.blur > 0) applyBlur(data, width, height, (settings.blur / 100) * size * 0.02);
  if (settings.sharpen > 0) applySharpen(data, width, height, (settings.sharpen / 100) * 1.5, Math.max(0.6, size / 1500));
  if (settings.vignette > 0) applyVignette(data, width, height, (settings.vignette / 100) * 0.85);
  return imageData;
}

// Draws `img` at `scale` and returns its pixels.
export function readPixels(img, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Full-resolution export.
export function exportImage(img, settings, mime) {
  const imageData = applyFilters(readPixels(img, 1), settings);
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (mime === 'image/jpeg') {
    // JPEG has no transparency - composite onto white rather than black.
    const backing = document.createElement('canvas');
    backing.width = canvas.width;
    backing.height = canvas.height;
    backing.getContext('2d').putImageData(imageData, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(backing, 0, 0);
  } else {
    ctx.putImageData(imageData, 0, 0);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Your browser couldn't create this image."))),
      mime,
      mime === 'image/png' ? undefined : 0.92,
    );
  });
}

export function buildDownloadName(originalName, extension) {
  return `${originalName.replace(/\.[^./]+$/, '')}-edited.${extension}`;
}
