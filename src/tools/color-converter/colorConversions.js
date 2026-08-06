// -----------------------------------------------------------------------
// COLOR CONVERSION LOGIC - no React, no DOM. Pure functions only, so this
// file can be read (or reused) completely independently of the UI in
// ColorConverter.jsx.
//
// Every function ultimately works through one canonical shape:
//   { r, g, b, a }   - r/g/b are integers 0-255, a is a float 0-1
// Every supported text format is just a different way of writing that
// same four numbers.
// -----------------------------------------------------------------------

// --- Small shared helpers ----------------------------------------------------

function toHexByte(n) {
  return Math.round(n).toString(16).padStart(2, '0');
}

// Rounds alpha to 2 decimal places so we never print noise like
// "0.5000000000000001" after floating-point math.
function roundAlpha(a) {
  return Math.round(a * 100) / 100;
}

// --- Format detection ---------------------------------------------------------

// Looks at the shape of the text to guess which parser to try. This is a
// quick guess, not full validation - the actual parser still checks the
// values are in range.
export function detectColorFormat(input) {
  const value = input.trim();
  if (value.startsWith('#')) return 'hex';
  if (/^rgba\s*\(/i.test(value)) return 'rgba';
  if (/^rgb\s*\(/i.test(value)) return 'rgb';
  if (/^hsla\s*\(/i.test(value)) return 'hsla';
  if (/^hsl\s*\(/i.test(value)) return 'hsl';
  // Bare comma-separated numbers with no wrapper, e.g. "255, 87, 51" -
  // treat as RGB(A), since that's the format people type shorthand.
  if (/^[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(\s*,\s*[\d.]+)?$/.test(value)) return 'rgb';
  return null;
}

// --- Parsing individual formats ------------------------------------------------
// Each of these throws a friendly Error message on invalid input, which
// parseColor() (below) catches and turns into a validation message.

function parseHexString(value) {
  const hex = value.replace('#', '').trim();
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Hex colors can only contain 0-9 and A-F.');
  }

  switch (hex.length) {
    case 3: // #RGB shorthand - each digit is doubled, e.g. "f" -> "ff"
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    case 4: // #RGBA shorthand
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: parseInt(hex[3] + hex[3], 16) / 255,
      };
    case 6:
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    case 8:
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    default:
      throw new Error('Hex colors must be 3, 4, 6, or 8 digits after the #.');
  }
}

function parseChannel(text) {
  const num = Number(text.trim());
  if (text.trim() === '' || !Number.isFinite(num) || num < 0 || num > 255) {
    throw new Error('Red, green, and blue must each be a number from 0 to 255.');
  }
  return Math.round(num);
}

function parseAlpha(text) {
  const num = Number(text.trim());
  if (text.trim() === '' || !Number.isFinite(num) || num < 0 || num > 1) {
    throw new Error('Alpha must be a number from 0 to 1 (e.g. 0.5).');
  }
  return num;
}

function parseRgbString(value) {
  // Strip an optional rgb(...) / rgba(...) wrapper, leaving just the numbers
  // - this is what lets bare "255,87,51" and "rgb(255,87,51)" share a parser.
  const inner = value.replace(/^rgba?\s*\(|\)\s*$/gi, '');
  const parts = inner.split(',').map((part) => part.trim());

  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error('RGB needs 3 numbers (red, green, blue), or 4 with alpha.');
  }

  const [r, g, b] = parts.slice(0, 3).map(parseChannel);
  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1;
  return { r, g, b, a };
}

function parseHue(text) {
  const num = Number(text.trim().replace(/deg$/i, ''));
  if (!Number.isFinite(num)) {
    throw new Error('Hue must be a number of degrees (0-360).');
  }
  // Hue wraps around a circle, so normalize instead of rejecting
  // out-of-range values like 370 or -10.
  return ((num % 360) + 360) % 360;
}

function parsePercent(text, label) {
  const num = Number(text.trim().replace('%', ''));
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw new Error(`${label} must be a percentage from 0 to 100.`);
  }
  return num;
}

function parseHslString(value) {
  const inner = value.replace(/^hsla?\s*\(|\)\s*$/gi, '');
  const parts = inner.split(',').map((part) => part.trim());

  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error('HSL needs 3 values (hue, saturation, lightness), or 4 with alpha.');
  }

  const h = parseHue(parts[0]);
  const s = parsePercent(parts[1], 'Saturation');
  const l = parsePercent(parts[2], 'Lightness');
  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1;
  return hslToRgb(h, s, l, a);
}

// Detects the format and parses it in one step. Returns either
// `{ ok: true, rgba }` or `{ ok: false, error }` - never throws, so the UI
// never needs a try/catch of its own.
export function parseColor(input) {
  const value = input.trim();
  if (!value) return { ok: false, error: '' }; // empty isn't an "error" to display

  const format = detectColorFormat(value);
  if (!format) {
    return { ok: false, error: "That doesn't match any supported format (HEX, RGB(A), or HSL(A))." };
  }

  try {
    if (format === 'hex') return { ok: true, rgba: parseHexString(value) };
    if (format === 'rgb' || format === 'rgba') return { ok: true, rgba: parseRgbString(value) };
    return { ok: true, rgba: parseHslString(value) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// A thin view of parseColor() for callers that only care whether the input
// is valid, not the parsed color itself - kept separate mainly to match the
// "detect / parse / validate" vocabulary used throughout this file.
export function validateColor(input) {
  const { ok, error } = parseColor(input);
  return { ok, error };
}

// --- Converting between the canonical shape and each format -------------------

export function hexToRgb(hex) {
  return parseHexString(hex);
}

// Ignores alpha - this is the plain 6-digit form used by the native
// <input type="color"> and as the base of rgbaToHex().
export function rgbToHex({ r, g, b }) {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

// Appends a 2-digit alpha channel when the color isn't fully opaque, so
// transparency survives a round-trip through hex whenever possible.
export function rgbaToHex({ r, g, b, a }) {
  const base = rgbToHex({ r, g, b });
  return a < 1 ? `${base}${toHexByte(Math.round(a * 255))}` : base;
}

// Standard RGB -> HSL conversion (see the CSS Color Module formula).
export function rgbToHsl({ r, g, b, a }) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) h = ((gNorm - bNorm) / delta) % 6;
    else if (max === gNorm) h = (bNorm - rNorm) / delta + 2;
    else h = (rNorm - gNorm) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100), a };
}

// Standard HSL -> RGB conversion (see the CSS Color Module formula).
export function hslToRgb(h, s, l, a = 1) {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let rPrime;
  let gPrime;
  let bPrime;
  if (h < 60) [rPrime, gPrime, bPrime] = [c, x, 0];
  else if (h < 120) [rPrime, gPrime, bPrime] = [x, c, 0];
  else if (h < 180) [rPrime, gPrime, bPrime] = [0, c, x];
  else if (h < 240) [rPrime, gPrime, bPrime] = [0, x, c];
  else if (h < 300) [rPrime, gPrime, bPrime] = [x, 0, c];
  else [rPrime, gPrime, bPrime] = [c, 0, x];

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
    a,
  };
}

// --- Formatting the canonical shape as display text ----------------------------

export function formatRgb({ r, g, b }) {
  return `rgb(${r}, ${g}, ${b})`;
}

export function formatRgba({ r, g, b, a }) {
  return `rgba(${r}, ${g}, ${b}, ${roundAlpha(a)})`;
}

export function formatHsl(rgba) {
  const { h, s, l } = rgbToHsl(rgba);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function formatHsla(rgba) {
  const { h, s, l, a } = rgbToHsl(rgba);
  return `hsla(${h}, ${s}%, ${l}%, ${roundAlpha(a)})`;
}

// --- Random color ---------------------------------------------------------------

export function randomRgb() {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
    a: 1,
  };
}
