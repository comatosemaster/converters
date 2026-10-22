// -----------------------------------------------------------------------
// BLUR / PIXELATE / BLACK-OUT LOGIC - no React. Browser-only (canvas).
//
// Areas are kept as shapes in the image's own pixel coordinates, not as
// pixels painted on a canvas. That's what lets the same areas be drawn on
// the small on-screen preview and on the full-resolution download, and
// lets Undo simply drop the last shape.
//
// Shapes: { type: 'rect' | 'ellipse', x, y, w, h }
//         { type: 'brush', points: [{x, y}...], size }
// -----------------------------------------------------------------------

export const EFFECTS = [
  { id: 'pixelate', label: 'Pixelate' },
  { id: 'blur', label: 'Blur' },
  { id: 'solid', label: 'Solid box' },
];

export const TOOLS = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'brush', label: 'Brush' },
];

export const DEFAULT_SETTINGS = { effect: 'pixelate', strength: 50, color: '#000000' };

// Effect size scales with the image, so a setting looks the same on a
// phone photo and a 6000px camera file - and on the preview vs download.
function effectPixels(strength, width, height) {
  const longSide = Math.max(width, height);
  return Math.max(2, (strength / 100) * longSide * 0.06);
}

function tracePath(ctx, shape, scale) {
  if (shape.type === 'rect') {
    ctx.rect(shape.x * scale, shape.y * scale, shape.w * scale, shape.h * scale);
  } else if (shape.type === 'ellipse') {
    ctx.ellipse(
      (shape.x + shape.w / 2) * scale,
      (shape.y + shape.h / 2) * scale,
      Math.abs(shape.w / 2) * scale,
      Math.abs(shape.h / 2) * scale,
      0,
      0,
      Math.PI * 2,
    );
  }
}

// Draws every shape as a solid mask (white where an effect applies).
function drawMask(ctx, shapes, scale) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  shapes.forEach((shape) => {
    ctx.beginPath();
    if (shape.type === 'brush') {
      ctx.lineWidth = shape.size * scale;
      shape.points.forEach((p, i) => (i ? ctx.lineTo(p.x * scale, p.y * scale) : ctx.moveTo(p.x * scale, p.y * scale)));
      // A single click still leaves a dot.
      if (shape.points.length === 1) ctx.lineTo(shape.points[0].x * scale + 0.01, shape.points[0].y * scale);
      ctx.stroke();
    } else {
      tracePath(ctx, shape, scale);
      ctx.fill();
    }
  });
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// The whole image with the effect applied everywhere; the mask then
// decides where it shows.
function effectLayer(img, width, height, settings) {
  const layer = makeCanvas(width, height);
  const ctx = layer.getContext('2d');
  if (settings.effect === 'solid') {
    ctx.fillStyle = settings.color;
    ctx.fillRect(0, 0, width, height);
    return layer;
  }
  const size = effectPixels(settings.strength, width, height);
  if (settings.effect === 'pixelate') {
    // Shrink so each block becomes one pixel, then enlarge without
    // smoothing: crisp, uniform squares.
    const small = makeCanvas(Math.max(1, Math.round(width / size)), Math.max(1, Math.round(height / size)));
    const sctx = small.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(img, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, width, height);
    return layer;
  }
  // Blur: shrinking and enlarging with smoothing in a few halving steps
  // works in every browser (canvas `filter` isn't in older Safari) and
  // doesn't darken the image edges the way a CSS blur filter does.
  let source = img;
  let w = width;
  let h = height;
  const target = Math.max(1, size / 2);
  while (w / 2 >= width / target && w > 2 && h > 2) {
    const next = makeCanvas(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    const nctx = next.getContext('2d');
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(source, 0, 0, next.width, next.height);
    source = next;
    w = next.width;
    h = next.height;
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return layer;
}

/**
 * Renders the image with every shape's area redacted, at `scale` of the
 * image's natural size (1 for the download). Returns a canvas.
 */
export function renderRedacted(img, shapes, settings, scale = 1) {
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const out = makeCanvas(width, height);
  const ctx = out.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  if (!shapes.length) return out;

  const effect = effectLayer(img, width, height, settings);
  const ectx = effect.getContext('2d');
  // Keep the effect only inside the shapes.
  const mask = makeCanvas(width, height);
  drawMask(mask.getContext('2d'), shapes, scale);
  ectx.globalCompositeOperation = 'destination-in';
  ectx.drawImage(mask, 0, 0);
  ctx.drawImage(effect, 0, 0);
  return out;
}

/** Turns a drag from (x0, y0) to (x1, y1) into a positive-size box. */
export function boxFromDrag(type, x0, y0, x1, y1) {
  return { type, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function redactedName(name, extension) {
  return `${name.replace(/\.[^./]+$/, '') || 'image'}-redacted.${extension}`;
}
