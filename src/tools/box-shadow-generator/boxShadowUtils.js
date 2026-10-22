import { formatRgba, rgbToHex } from '../color-converter/colorConversions.js';

// -----------------------------------------------------------------------
// BOX SHADOW LOGIC - no React, no DOM. A design is a list of shadow
// layers plus the preview settings around it; everything here turns that
// plain data into CSS text. Colors use the site's { r, g, b, a } shape
// from colorConversions.js.
// -----------------------------------------------------------------------

export const MAX_LAYERS = 6;

// Slider ranges, in px. Most real shadows sit well inside these.
export const RANGES = {
  x: { min: -100, max: 100 },
  y: { min: -100, max: 100 },
  blur: { min: 0, max: 150 },
  spread: { min: -50, max: 100 },
};

let nextId = 1;

export function createLayer(patch = {}) {
  return { id: nextId++, x: 0, y: 8, blur: 24, spread: -4, color: { r: 15, g: 23, b: 42, a: 0.18 }, inset: false, ...patch };
}

export function createDefaultDesign() {
  return {
    layers: [createLayer()],
    boxColor: '#ffffff',
    canvasColor: '#e9ecf2',
    radius: 16,
  };
}

// The comparison used for "has the user changed anything?" - layer ids
// are left out because they're internal bookkeeping, not design.
export function designSignature(design) {
  return JSON.stringify({ ...design, layers: design.layers.map(({ id: _id, ...layer }) => layer) });
}

function px(n) {
  return n === 0 ? '0' : `${n}px`;
}

function colorText(color) {
  return color.a >= 1 ? rgbToHex(color) : formatRgba(color);
}

export function layerToCss(layer) {
  // Spread is optional in CSS; leaving a 0 out keeps the output tidy.
  const parts = [px(layer.x), px(layer.y), px(layer.blur)];
  if (layer.spread !== 0) parts.push(px(layer.spread));
  parts.push(colorText(layer.color));
  return `${layer.inset ? 'inset ' : ''}${parts.join(' ')}`;
}

/** The value of the box-shadow property (without "box-shadow:"). */
export function shadowValue(layers) {
  return layers.length ? layers.map(layerToCss).join(', ') : 'none';
}

export function cssDeclaration(design) {
  const { layers } = design;
  const value =
    layers.length > 1 ? `\n    ${layers.map(layerToCss).join(',\n    ')}` : ` ${shadowValue(layers)}`;
  return `box-shadow:${value};\nborder-radius: ${design.radius}px;`;
}

// Tailwind's arbitrary-value syntax: spaces become underscores, and the
// commas between layers stay as they are.
export function tailwindClass(layers) {
  return `shadow-[${shadowValue(layers).replace(/,\s+/g, ',').replace(/\s+/g, '_')}]`;
}

const rgba = (r, g, b, a) => ({ r, g, b, a });

// Each preset is a full design (layers + the surfaces that make it look
// right - neumorphism only works when box and page are the same color).
export const PRESETS = [
  {
    id: 'subtle',
    name: 'Subtle',
    layers: [{ x: 0, y: 1, blur: 3, spread: 0, color: rgba(0, 0, 0, 0.1) }, { x: 0, y: 1, blur: 2, spread: -1, color: rgba(0, 0, 0, 0.1) }],
  },
  {
    id: 'soft',
    name: 'Soft card',
    layers: [{ x: 0, y: 8, blur: 24, spread: -4, color: rgba(15, 23, 42, 0.18) }],
  },
  {
    id: 'layered',
    name: 'Layered smooth',
    layers: [
      { x: 0, y: 1, blur: 1, spread: 0, color: rgba(0, 0, 0, 0.08) },
      { x: 0, y: 2, blur: 2, spread: 0, color: rgba(0, 0, 0, 0.08) },
      { x: 0, y: 4, blur: 4, spread: 0, color: rgba(0, 0, 0, 0.08) },
      { x: 0, y: 8, blur: 8, spread: 0, color: rgba(0, 0, 0, 0.08) },
      { x: 0, y: 16, blur: 16, spread: 0, color: rgba(0, 0, 0, 0.08) },
    ],
  },
  {
    id: 'floating',
    name: 'Floating',
    layers: [{ x: 0, y: 25, blur: 50, spread: -12, color: rgba(0, 0, 0, 0.25) }],
  },
  {
    id: 'elevated',
    name: 'Material 8dp',
    layers: [
      { x: 0, y: 5, blur: 5, spread: -3, color: rgba(0, 0, 0, 0.2) },
      { x: 0, y: 8, blur: 10, spread: 1, color: rgba(0, 0, 0, 0.14) },
      { x: 0, y: 3, blur: 14, spread: 2, color: rgba(0, 0, 0, 0.12) },
    ],
  },
  {
    id: 'retro',
    name: 'Hard offset',
    layers: [{ x: 8, y: 8, blur: 0, spread: 0, color: rgba(17, 17, 17, 1) }],
    canvasColor: '#fde68a',
    radius: 4,
  },
  {
    id: 'glow',
    name: 'Glow',
    layers: [{ x: 0, y: 0, blur: 32, spread: 4, color: rgba(91, 61, 245, 0.55) }],
    canvasColor: '#0f1020',
    boxColor: '#1b1c33',
  },
  {
    id: 'neumorphism',
    name: 'Neumorphism',
    layers: [
      { x: 10, y: 10, blur: 20, spread: 0, color: rgba(184, 190, 200, 1) },
      { x: -10, y: -10, blur: 20, spread: 0, color: rgba(255, 255, 255, 1) },
    ],
    canvasColor: '#e4e8ee',
    boxColor: '#e4e8ee',
    radius: 24,
  },
  {
    id: 'inset',
    name: 'Inner shadow',
    layers: [{ x: 0, y: 2, blur: 6, spread: 0, color: rgba(0, 0, 0, 0.25), inset: true }],
    radius: 12,
  },
];

export function designFromPreset(preset) {
  const base = createDefaultDesign();
  return {
    layers: preset.layers.map((layer) => createLayer({ inset: false, ...layer })),
    boxColor: preset.boxColor ?? base.boxColor,
    canvasColor: preset.canvasColor ?? base.canvasColor,
    radius: preset.radius ?? base.radius,
  };
}
