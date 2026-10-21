// -----------------------------------------------------------------------
// IMAGE ROTATION LOGIC - no React. The same function draws the small live
// preview and the full-size download, so they always match.
// -----------------------------------------------------------------------

export const FIT_MODES = [
  { id: 'expand', label: 'Fit whole image', hint: 'Canvas grows; corners get the background color' },
  { id: 'crop', label: 'Keep original size', hint: 'Same dimensions; the corners are cut off' },
  { id: 'fill', label: 'Zoom to fill', hint: 'No empty corners - best for straightening photos' },
];

export const BACKGROUNDS = [
  { id: 'transparent', label: 'Transparent' },
  { id: '#ffffff', label: 'White' },
  { id: '#000000', label: 'Black' },
  { id: 'custom', label: 'Custom color' },
];

// Normalises any angle to (-180, 180].
export function normalizeAngle(degrees) {
  let a = ((degrees % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 100) / 100;
}

// Output size and the scale the image is drawn at, for a given rotation.
export function layout(width, height, degrees, fit) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  // Bounding box of the rotated image.
  const boxWidth = width * cos + height * sin;
  const boxHeight = width * sin + height * cos;
  if (fit === 'expand') {
    return { width: Math.round(boxWidth), height: Math.round(boxHeight), scale: 1 };
  }
  // Quarter turns swap width and height; any other angle keeps the
  // original frame. (A 90° turn should give a portrait image from a
  // landscape one, not a landscape frame with the picture cropped away.)
  const quarter = Math.abs(Math.round(degrees / 90)) % 2 === 1 && Math.abs(degrees % 90) < 1e-9;
  const frameWidth = quarter ? height : width;
  const frameHeight = quarter ? width : height;
  if (fit === 'crop') return { width: frameWidth, height: frameHeight, scale: 1 };
  // Zoom to fill: the smallest scale at which the rotated image still
  // covers the whole frame, so no background shows in the corners.
  const coverWidth = frameWidth * cos + frameHeight * sin;
  const coverHeight = frameWidth * sin + frameHeight * cos;
  const scale = Math.max(coverWidth / (quarter ? height : width), coverHeight / (quarter ? width : height));
  return { width: frameWidth, height: frameHeight, scale: Math.max(1, scale) };
}

/**
 * Draws `img` rotated by `degrees` (clockwise) onto a new canvas.
 * `size` scales the whole output (1 = full resolution, smaller for previews).
 */
export function renderRotated(img, { degrees, fit, background, mime }, size = 1) {
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;
  const out = layout(naturalWidth, naturalHeight, degrees, fit);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(out.width * size));
  canvas.height = Math.max(1, Math.round(out.height * size));
  const ctx = canvas.getContext('2d');

  // JPEG has no transparency - fall back to white rather than black.
  const fill = background === 'transparent' && mime === 'image/jpeg' ? '#ffffff' : background;
  if (fill && fill !== 'transparent') {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Exact quarter turns just move pixels around - no smoothing, so the
  // result is pixel-identical to the original, only turned.
  ctx.imageSmoothingEnabled = degrees % 90 !== 0 || size !== 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  const drawScale = out.scale * size;
  ctx.drawImage(img, (-naturalWidth * drawScale) / 2, (-naturalHeight * drawScale) / 2, naturalWidth * drawScale, naturalHeight * drawScale);
  return canvas;
}

export function canvasToBlob(canvas, mime) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Your browser couldn't create this image."))),
      mime,
      mime === 'image/png' ? undefined : 0.92,
    );
  });
}

export function buildDownloadName(originalName, extension) {
  return `${originalName.replace(/\.[^./]+$/, '')}-rotated.${extension}`;
}
