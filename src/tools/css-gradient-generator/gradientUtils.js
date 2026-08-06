// -----------------------------------------------------------------------
// GRADIENT LOGIC - no React, no DOM. Pure functions only, so this file
// can be read (or reused) completely independently of the UI in
// GradientGenerator.jsx.
//
// Color math is NOT duplicated here - every stop's color is the same
// canonical { r, g, b, a } shape used by the Color Converter tool, and
// formatting/parsing/random-generation reuse its functions directly.
// -----------------------------------------------------------------------

import { hexToRgb, formatRgba, hslToRgb } from '../color-converter/colorConversions.js';

export const MIN_STOPS = 2;
export const MAX_STOPS = 10;

export const GRADIENT_TYPES = [
  { id: 'linear', label: 'Linear' },
  { id: 'radial', label: 'Radial' },
];

export const RADIAL_SHAPES = [
  { id: 'circle', label: 'Circle' },
  { id: 'ellipse', label: 'Ellipse' },
];

// CSS's own `at <position>` keyword syntax - these values are used
// directly in the generated gradient string, no translation needed.
export const POSITION_OPTIONS = [
  { id: 'center', label: 'Center' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top left', label: 'Top Left' },
  { id: 'top right', label: 'Top Right' },
  { id: 'bottom left', label: 'Bottom Left' },
  { id: 'bottom right', label: 'Bottom Right' },
];

function makeStopId() {
  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Two fixed (non-random) ids so a freshly created default gradient is
// byte-identical to another freshly created one - this is what lets the
// "has anything changed?" check in GradientGenerator.jsx use a plain
// JSON.stringify comparison instead of a custom deep-equal function.
export function createDefaultGradient() {
  return {
    type: 'linear',
    angle: 90,
    radialShape: 'circle',
    radialPosition: 'center',
    stops: [
      { id: 'default-stop-0', position: 0, color: { r: 91, g: 61, b: 245, a: 1 } },
      { id: 'default-stop-1', position: 100, color: { r: 236, g: 72, b: 153, a: 1 } },
    ],
  };
}

// --- CSS generation ---------------------------------------------------------------

// Stops are kept in whatever order the user added them (so the editor
// list below the bar doesn't jump around while dragging), but the CSS
// syntax itself needs them sorted by position - this is the one place
// that sort happens.
function stopsToCssList(stops) {
  return [...stops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${formatRgba(stop.color)} ${stop.position}%`)
    .join(', ');
}

// The suggested `generateGradient()` utility - builds just the function
// notation (`linear-gradient(...)`), used for both the live preview's
// inline style and as the core of the full CSS declaration below.
export function generateGradient(gradient) {
  const stopsCss = stopsToCssList(gradient.stops);
  if (gradient.type === 'radial') {
    return `radial-gradient(${gradient.radialShape} at ${gradient.radialPosition}, ${stopsCss})`;
  }
  return `linear-gradient(${gradient.angle}deg, ${stopsCss})`;
}

// The suggested `updateCssCode()` utility - the full copyable/downloadable
// CSS declaration shown in the code block.
export function generateCssDeclaration(gradient) {
  return `background: ${generateGradient(gradient)};`;
}

// --- Stop editing -----------------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(colorA, colorB, t) {
  return {
    r: Math.round(lerp(colorA.r, colorB.r, t)),
    g: Math.round(lerp(colorA.g, colorB.g, t)),
    b: Math.round(lerp(colorA.b, colorB.b, t)),
    a: Math.round(lerp(colorA.a, colorB.a, t) * 100) / 100,
  };
}

// Inserts a new stop in the middle of the WIDEST gap between existing
// stops (rather than always appending at the end), with a color
// interpolated between its two new neighbors - so a new stop always
// starts out blending in, never as a jarring flat band of one color.
export function addStop(stops) {
  if (stops.length >= MAX_STOPS) return stops;

  const sorted = [...stops].sort((a, b) => a.position - b.position);
  let bestGap = -1;
  let bestIndex = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].position - sorted[i].position;
    if (gap > bestGap) {
      bestGap = gap;
      bestIndex = i;
    }
  }

  const left = sorted[bestIndex];
  const right = sorted[bestIndex + 1];
  const newStop = {
    id: makeStopId(),
    position: Math.round((left.position + right.position) / 2),
    color: lerpColor(left.color, right.color, 0.5),
  };
  return [...stops, newStop];
}

// Refuses to go below MIN_STOPS - a gradient needs at least two colors
// to be a gradient at all.
export function removeStop(stops, id) {
  if (stops.length <= MIN_STOPS) return stops;
  return stops.filter((stop) => stop.id !== id);
}

export function updateStopPosition(stops, id, position) {
  const clamped = Math.max(0, Math.min(100, Math.round(position)));
  return stops.map((stop) => (stop.id === id ? { ...stop, position: clamped } : stop));
}

export function updateStopColor(stops, id, color) {
  return stops.map((stop) => (stop.id === id ? { ...stop, color } : stop));
}

// --- Random gradients ---------------------------------------------------------------

// "Attractive" here means colors that are related (drawn from a shared
// hue range, like a real design palette) rather than fully independent
// random RGB values, which tend to look muddy together - and a
// consistently vivid saturation/lightness band so nothing comes out
// near-black, near-white, or grayed out.
export function randomGradient() {
  const stopCount = 2 + Math.floor(Math.random() * 3); // 2-4
  const baseHue = Math.random() * 360;
  const hueSpread = 60 + Math.random() * 120; // 60-180 degrees across the whole gradient

  const stops = Array.from({ length: stopCount }, (_, index) => {
    const position = stopCount === 1 ? 0 : Math.round((index / (stopCount - 1)) * 100);
    const hue = (baseHue + (hueSpread * index) / Math.max(1, stopCount - 1)) % 360;
    const saturation = 65 + Math.random() * 25; // 65-90%
    const lightness = 45 + Math.random() * 20; // 45-65%
    return { id: makeStopId(), position, color: hslToRgb(hue, saturation, lightness, 1) };
  });

  const type = Math.random() < 0.75 ? 'linear' : 'radial';
  return {
    type,
    angle: Math.floor(Math.random() * 360),
    radialShape: Math.random() < 0.5 ? 'circle' : 'ellipse',
    radialPosition: POSITION_OPTIONS[Math.floor(Math.random() * POSITION_OPTIONS.length)].id,
    stops,
  };
}

// --- Presets ------------------------------------------------------------------------

function presetStop(position, hex) {
  return { position, color: hexToRgb(hex) };
}

// Hex values only need to be correct once, here - loadPreset() below
// gives every stop a fresh id each time a preset is actually applied.
export const PRESETS = [
  { id: 'sunset', name: 'Sunset', type: 'linear', angle: 135, stops: [presetStop(0, '#ff512f'), presetStop(100, '#f09819')] },
  { id: 'ocean', name: 'Ocean', type: 'linear', angle: 120, stops: [presetStop(0, '#2193b0'), presetStop(100, '#6dd5ed')] },
  { id: 'forest', name: 'Forest', type: 'linear', angle: 135, stops: [presetStop(0, '#134e5e'), presetStop(100, '#71b280')] },
  {
    id: 'purple-dream',
    name: 'Purple Dream',
    type: 'linear',
    angle: 135,
    stops: [presetStop(0, '#654ea3'), presetStop(100, '#eaafc8')],
  },
  { id: 'fire', name: 'Fire', type: 'linear', angle: 45, stops: [presetStop(0, '#f12711'), presetStop(100, '#f5af19')] },
  { id: 'sky', name: 'Sky', type: 'linear', angle: 180, stops: [presetStop(0, '#56ccf2'), presetStop(100, '#2f80ed')] },
  {
    id: 'neon',
    name: 'Neon',
    type: 'linear',
    angle: 90,
    stops: [presetStop(0, '#12c2e9'), presetStop(50, '#c471ed'), presetStop(100, '#f64f59')],
  },
  {
    id: 'dark-mode',
    name: 'Dark Mode',
    type: 'linear',
    angle: 135,
    stops: [presetStop(0, '#232526'), presetStop(100, '#414345')],
  },
];

// The suggested `loadPreset()` utility - returns a full gradient object
// (radial fields included, defaulted, since presets are linear) ready to
// drop straight into state.
export function loadPreset(preset) {
  return {
    type: preset.type,
    angle: preset.angle ?? 90,
    radialShape: 'circle',
    radialPosition: 'center',
    stops: preset.stops.map((stop) => ({ id: makeStopId(), position: stop.position, color: stop.color })),
  };
}
