// -----------------------------------------------------------------------
// SVG -> PNG/JPG/WebP LOGIC - no React. Browser-only (DOMParser, canvas);
// nothing here runs while pages are prerendered.
//
// The key idea: instead of drawing the SVG at its own size and scaling
// the pixels up (blurry), the SVG's width/height are rewritten to the
// output size before it's drawn, so the browser renders the vector shapes
// sharply at exactly that resolution.
//
// The SVG is only ever loaded as an <img>, never inserted into the page,
// so any <script> or event handler inside it cannot run.
// -----------------------------------------------------------------------

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Canvas size browsers handle reliably on most devices, including phones.
export const MAX_OUTPUT_SIDE = 8192;
// Used when an SVG has no usable size at all (CSS's default for replaced
// elements, which is also what browsers fall back to).
const FALLBACK_SIZE = { width: 300, height: 150 };

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const UNIT_TO_PX = { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 };

export const SCALES = [0.5, 1, 2, 3, 4];

export const FORMATS = [
  { mime: 'image/png', label: 'PNG', extension: 'png', transparent: true },
  { mime: 'image/jpeg', label: 'JPG', extension: 'jpg', transparent: false },
  { mime: 'image/webp', label: 'WebP', extension: 'webp', transparent: true },
];

// "24", "24px", "1.5in" -> pixels. Percentages and em/ex depend on a
// context an image doesn't have, so they count as "no size given".
function lengthToPx(value) {
  const match = /^\s*([\d.]+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value ?? '');
  if (!match) return null;
  const factor = UNIT_TO_PX[(match[2] || 'px').toLowerCase()];
  const px = Number(match[1]) * (factor ?? NaN);
  return Number.isFinite(px) && px > 0 ? px : null;
}

/**
 * Makes SVG code copied out of a web page work as a standalone file.
 * Inline SVG in HTML may leave out the namespace declarations and use
 * HTML-only entities, which a strict XML parser - and therefore a browser
 * loading the SVG as an image - rejects.
 */
function repairSource(text) {
  let source = text.replace(/^﻿/, '').trim();
  source = source.replace(/&nbsp;/g, '&#160;').replace(/&copy;/g, '&#169;').replace(/&reg;/g, '&#174;');
  source = source.replace(/<svg\b([^>]*)>/i, (tag, attrs) => {
    let fixed = attrs;
    if (!/\sxmlns\s*=/.test(fixed)) fixed += ` xmlns="${SVG_NS}"`;
    if (/xlink:/.test(source) && !/\sxmlns:xlink\s*=/.test(fixed)) fixed += ` xmlns:xlink="${XLINK_NS}"`;
    return `<svg${fixed}>`;
  });
  return source;
}

/**
 * SVG text -> { ok, source, width, height, warnings } or { ok: false, error }.
 * `source` is the repaired SVG; width/height its natural size in px.
 */
export function inspectSvg(text) {
  if (!/<svg[\s>]/i.test(text)) {
    return { ok: false, error: "This doesn't look like SVG - it has no <svg> element." };
  }
  const source = repairSource(text);
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    const detail = parserError.textContent.split('\n').find((line) => /line|error/i.test(line))?.trim();
    return { ok: false, error: `The SVG code has a syntax error${detail ? `: ${detail.slice(0, 160)}` : '.'}` };
  }
  const svg = doc.documentElement;
  if (svg.localName !== 'svg') return { ok: false, error: 'The file is XML, but its top element is not <svg>.' };

  const viewBox = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const hasViewBox = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0;
  let width = lengthToPx(svg.getAttribute('width'));
  let height = lengthToPx(svg.getAttribute('height'));

  // Fill in a missing side from the viewBox's proportions.
  if (hasViewBox) {
    const ratio = viewBox[2] / viewBox[3];
    if (width && !height) height = width / ratio;
    else if (height && !width) width = height * ratio;
    else if (!width && !height) [width, height] = [viewBox[2], viewBox[3]];
  }
  if (!width || !height) ({ width, height } = FALLBACK_SIZE);

  const warnings = [];
  const external = [...doc.querySelectorAll('image, use, feImage')].some((el) => {
    const href = el.getAttribute('href') ?? el.getAttributeNS(XLINK_NS, 'href') ?? '';
    return /^(https?:)?\/\//i.test(href) || (href && !href.startsWith('#') && !href.startsWith('data:'));
  });
  if (external || /@import|url\(\s*['"]?(https?:)?\/\//i.test(source)) {
    warnings.push('This SVG links to outside images or fonts. Browsers block those when converting, so they will be missing - embed them in the SVG (as data: URLs) to include them.');
  }
  if (doc.querySelector('text') && /font-family/i.test(source)) {
    warnings.push("Text uses the fonts installed on this device. If the SVG's font isn't installed, a similar one is used instead - convert text to outlines in your editor for an exact match.");
  }
  if (doc.querySelector('foreignObject')) {
    warnings.push('This SVG contains HTML (foreignObject), which some browsers refuse to convert.');
  }

  return { ok: true, source, width, height, hasViewBox, warnings };
}

/** Output size for a chosen sizing mode, clamped to MAX_OUTPUT_SIDE. */
export function outputSize(info, sizing) {
  let width;
  let height;
  if (sizing.mode === 'width') {
    width = sizing.value;
    height = (info.height / info.width) * width;
  } else if (sizing.mode === 'height') {
    height = sizing.value;
    width = (info.width / info.height) * height;
  } else {
    width = info.width * sizing.value;
    height = info.height * sizing.value;
  }
  const shrink = Math.min(1, MAX_OUTPUT_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * shrink)),
    height: Math.max(1, Math.round(height * shrink)),
    clamped: shrink < 1,
  };
}

// The SVG with its root width/height set to the output size. A viewBox is
// added if missing (from the original size) so the content scales with
// it instead of being cropped.
export function sizedSource(info, width, height) {
  const doc = new DOMParser().parseFromString(info.source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!info.hasViewBox) svg.setAttribute('viewBox', `0 0 ${info.width} ${info.height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(doc);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Your browser couldn't draw this SVG. It may use features that only work inside a web page."));
    img.src = url;
  });
}

/** Renders the SVG to a Blob of the given type and size. */
export async function rasterize(info, { width, height, mime, background }) {
  const url = URL.createObjectURL(new Blob([sizedSource(info, width, height)], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('This image is too large for your browser to create. Try a smaller size.'))),
          mime,
          mime === 'image/png' ? undefined : 0.92,
        );
      } catch {
        // A "tainted" canvas: the browser treated part of the SVG as
        // coming from elsewhere and won't let it be exported.
        reject(new Error('Your browser blocked exporting this SVG because it contains external or HTML content.'));
      }
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function outputName(name, extension) {
  return `${name.replace(/\.svg$/i, '') || 'image'}.${extension}`;
}
