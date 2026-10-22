import { formatHsl, formatRgb, rgbToHex, rgbToHsl } from '../color-converter/colorConversions.js';
import { readableTextColor } from '../color-contrast-checker/contrastUtils.js';

// -----------------------------------------------------------------------
// PALETTE EXTRACTION - no React, no DOM. Takes raw RGBA pixels (from a
// canvas the component draws a downscaled copy of the image onto) and
// finds the image's main colors with k-means clustering.
//
// Clustering happens in CIELAB rather than RGB: Lab is built so that
// equal distances look like equal color differences to people, so the
// clusters match what you'd point at as "the colors" of a photo instead
// of splitting hairs between dark shades the eye barely tells apart.
//
// Results are deterministic - a fixed random seed means the same image
// always gives the same palette.
// -----------------------------------------------------------------------

export const MIN_COLORS = 2;
export const MAX_COLORS = 12;
export const DEFAULT_COLORS = 6;

// Pixels sampled per image. Plenty for a stable palette; more only costs time.
export const SAMPLE_SIZE = 160;

// --- sRGB <-> CIELAB (D65 white point) ------------------------------------

function toLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function fromLinear(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

const WHITE = [0.95047, 1, 1.08883];
const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const labFInv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

export function rgbToLab(r, g, b) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / WHITE[0];
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / WHITE[1];
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / WHITE[2];
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([l, a, bb]) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - bb / 200;
  const x = labFInv(fx) * WHITE[0];
  const y = labFInv(fy) * WHITE[1];
  const z = labFInv(fz) * WHITE[2];
  return {
    r: fromLinear(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    g: fromLinear(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    b: fromLinear(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
    a: 1,
  };
}

// --- k-means ---------------------------------------------------------------

// Small seeded PRNG (mulberry32) so results repeat exactly.
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function distance2(p, c) {
  const dl = p[0] - c[0];
  const da = p[1] - c[1];
  const db = p[2] - c[2];
  return dl * dl + da * da + db * db;
}

// k-means++ start: each new center is picked far from the ones already
// chosen, which avoids two centers landing in the same color.
function initialCenters(points, k, random) {
  const centers = [points[Math.floor(random() * points.length)]];
  const nearest = new Float64Array(points.length).fill(Infinity);
  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let total = 0;
    for (let i = 0; i < points.length; i += 1) {
      nearest[i] = Math.min(nearest[i], distance2(points[i], last));
      total += nearest[i];
    }
    if (total === 0) break; // fewer distinct colors than k
    let target = random() * total;
    let pick = 0;
    for (; pick < points.length - 1; pick += 1) {
      target -= nearest[pick];
      if (target <= 0) break;
    }
    centers.push(points[pick]);
  }
  return centers.map((c) => [...c]);
}

function kMeans(points, k, random) {
  let centers = initialCenters(points, k, random);
  const assignment = new Int32Array(points.length);
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let moved = 0;
    for (let i = 0; i < points.length; i += 1) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const d = distance2(points[i], centers[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignment[i] !== best) moved += 1;
      assignment[i] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i += 1) {
      const s = sums[assignment[i]];
      s[0] += points[i][0];
      s[1] += points[i][1];
      s[2] += points[i][2];
      s[3] += 1;
    }
    centers = sums.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[c]));
    if (iteration > 0 && moved === 0) break;
  }
  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < points.length; i += 1) counts[assignment[i]] += 1;
  return centers.map((center, c) => ({ lab: center, count: counts[c] })).filter((c) => c.count > 0);
}

// Asking for 8 colors from a logo with 3 makes k-means split noise into
// near-identical swatches. Clusters closer than this (CIE76 delta E - about
// the smallest difference people notice side by side) are merged.
const MERGE_DISTANCE = 6;

function mergeSimilar(clusters) {
  const merged = [];
  [...clusters]
    .sort((x, y) => y.count - x.count)
    .forEach((cluster) => {
      const twin = merged.find((m) => Math.sqrt(distance2(m.lab, cluster.lab)) < MERGE_DISTANCE);
      if (!twin) {
        merged.push({ ...cluster });
        return;
      }
      const total = twin.count + cluster.count;
      twin.lab = twin.lab.map((v, i) => (v * twin.count + cluster.lab[i] * cluster.count) / total);
      twin.count = total;
    });
  return merged;
}

/**
 * RGBA pixel data -> palette sorted by how much of the image each color
 * covers. Fully/mostly transparent pixels are skipped.
 * Returns [{ hex, rgb, rgbText, hslText, share, textColor }].
 */
export function extractPalette(data, count) {
  const points = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    points.push(rgbToLab(data[i], data[i + 1], data[i + 2]));
  }
  if (points.length === 0) return [];

  const clusters = mergeSimilar(kMeans(points, Math.min(count, points.length), seededRandom(1234567)));
  return clusters
    .sort((x, y) => y.count - x.count)
    .map((cluster) => {
      const rgb = labToRgb(cluster.lab);
      return {
        hex: rgbToHex(rgb),
        rgb,
        lab: cluster.lab,
        rgbText: formatRgb(rgb),
        hslText: formatHsl(rgb),
        share: cluster.count / points.length,
        textColor: readableTextColor(rgb),
      };
    });
}

export const SORTS = [
  { id: 'share', label: 'Most used first' },
  { id: 'hue', label: 'By hue' },
  { id: 'light', label: 'Light to dark' },
];

export function sortPalette(palette, sort) {
  const list = [...palette];
  if (sort === 'hue') {
    // Grays have no meaningful hue, so they go last, light to dark.
    const key = (c) => {
      const { h, s } = rgbToHsl(c.rgb);
      return s < 10 ? 1000 - c.lab[0] : h;
    };
    list.sort((a, b) => key(a) - key(b));
  } else if (sort === 'light') {
    list.sort((a, b) => b.lab[0] - a.lab[0]);
  }
  return list;
}

// --- Exports ----------------------------------------------------------------

export const EXPORT_FORMATS = [
  { id: 'css', label: 'CSS variables' },
  { id: 'scss', label: 'SCSS' },
  { id: 'tailwind', label: 'Tailwind' },
  { id: 'json', label: 'JSON' },
  { id: 'list', label: 'HEX list' },
];

export function exportPalette(palette, format) {
  const hexes = palette.map((c) => c.hex);
  switch (format) {
    case 'css':
      return `:root {\n${hexes.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}`;
    case 'scss':
      return hexes.map((h, i) => `$color-${i + 1}: ${h};`).join('\n');
    case 'tailwind':
      return `// tailwind.config.js -> theme.extend.colors\npalette: {\n${hexes.map((h, i) => `  '${i + 1}': '${h}',`).join('\n')}\n},`;
    case 'json':
      return JSON.stringify(hexes, null, 2);
    default:
      return hexes.join('\n');
  }
}
