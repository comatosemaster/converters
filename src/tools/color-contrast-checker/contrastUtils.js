import { hslToRgb, parseColor, rgbToHex, rgbToHsl } from '../color-converter/colorConversions.js';

// -----------------------------------------------------------------------
// WCAG COLOR CONTRAST - no React, no DOM (apart from the optional named-
// color lookup). The formulas are the ones in WCAG 2.2, section 1.4.3:
// https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
// Colors use the site's canonical { r, g, b, a } shape from
// colorConversions.js.
// -----------------------------------------------------------------------

// The pass marks WCAG sets. "Large" text is 24px+ regular or 18.66px+
// (14pt) bold; "UI" covers icons, input borders and focus rings (1.4.11).
export const CRITERIA = [
  { id: 'normal-aa', label: 'Normal text', level: 'AA', min: 4.5, criterion: '1.4.3' },
  { id: 'normal-aaa', label: 'Normal text', level: 'AAA', min: 7, criterion: '1.4.6' },
  { id: 'large-aa', label: 'Large text', level: 'AA', min: 3, criterion: '1.4.3' },
  { id: 'large-aaa', label: 'Large text', level: 'AAA', min: 4.5, criterion: '1.4.6' },
  { id: 'ui-aa', label: 'UI components & icons', level: 'AA', min: 3, criterion: '1.4.11' },
];

// sRGB channel (0-255) -> linear light. The 0.04045 threshold is the
// exact sRGB value; WCAG's text says 0.03928, a typo from an older draft
// that makes no difference at 8 bits per channel.
function linearize(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// WCAG only defines contrast between opaque colors. A see-through color is
// what it looks like on top of whatever is behind it, so it's blended
// first: the text over the background, the background over white (the
// usual page color underneath).
export function blendOver(top, bottom) {
  const a = top.a ?? 1;
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1,
  };
}

const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };

export function effectiveColors(foreground, background) {
  const bg = blendOver(background, WHITE);
  return { fg: blendOver(foreground, bg), bg };
}

/** Text color (black or white) that reads best on `color`. */
export function readableTextColor(color) {
  return contrastRatio(color, BLACK) >= contrastRatio(color, WHITE) ? '#000000' : '#ffffff';
}

// Rounds DOWN to two decimals for display, so 4.499 shows as 4.49 rather
// than a misleading 4.50 - WCAG has no rounding, a color passes only if
// the exact ratio meets the threshold.
export function formatRatio(ratio) {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

/**
 * Accepts everything the Color Converter does (HEX, RGB(A), HSL(A)), plus
 * hex without the "#" and, in a browser, CSS color names like "navy".
 * Returns { ok, rgba } or { ok: false, error }.
 */
export function parseAnyColor(input) {
  const value = input.trim();
  if (!value) return { ok: false, error: 'Enter a color.' };
  if (/^[0-9a-f]{3,4}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i.test(value)) return parseColor(`#${value}`);
  const parsed = parseColor(value);
  if (parsed.ok) return parsed;

  if (/^[a-z]+$/i.test(value) && typeof document !== 'undefined') {
    // The browser already knows every CSS color name - a canvas turns one
    // into "#rrggbb" (or "rgba(...)" for "transparent") for us. An unknown
    // name leaves fillStyle unchanged, which the sentinel value detects.
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#010203';
    ctx.fillStyle = value;
    if (ctx.fillStyle !== '#010203') {
      const named = parseColor(ctx.fillStyle);
      if (named.ok) return named;
    }
    return { ok: false, error: `"${value}" isn't a color name CSS knows.` };
  }
  return parsed.error ? parsed : { ok: false, error: 'Use HEX (#1a2b3c), RGB, HSL or a CSS color name.' };
}

/**
 * The closest color to `color` (same hue and saturation, lightness
 * changed as little as possible) that reaches `target` contrast against
 * `against`. Tries both darker and lighter, returns the smaller change,
 * or null when neither direction can get there.
 */
export function suggestColor(color, against, target) {
  const hsl = rgbToHsl({ ...color, a: 1 });
  const candidates = [];

  for (const direction of [-1, 1]) {
    const limit = direction < 0 ? 0 : 100;
    const atLimit = hslToRgb(hsl.h, hsl.s, limit);
    if (contrastRatio(atLimit, against) < target) continue;

    // Binary search on lightness for the boundary, then nudge until the
    // rounded RGB result really passes (rounding can cost a hair).
    let near = hsl.l;
    let far = limit;
    for (let i = 0; i < 30; i += 1) {
      const mid = (near + far) / 2;
      if (contrastRatio(hslToRgb(hsl.h, hsl.s, mid), against) >= target) far = mid;
      else near = mid;
    }
    let lightness = far;
    let rgb = hslToRgb(hsl.h, hsl.s, lightness);
    while (contrastRatio(rgb, against) < target && lightness !== limit) {
      lightness = direction < 0 ? Math.max(0, lightness - 0.1) : Math.min(100, lightness + 0.1);
      rgb = hslToRgb(hsl.h, hsl.s, lightness);
    }
    candidates.push({ rgb: { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 }, change: Math.abs(lightness - hsl.l) });
  }

  if (candidates.length === 0) return null;
  candidates.sort((x, y) => x.change - y.change);
  const best = candidates[0].rgb;
  return { rgba: best, hex: rgbToHex(best), ratio: contrastRatio(best, against) };
}
