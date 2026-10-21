// -----------------------------------------------------------------------
// ADD-WATERMARK LOGIC - no React. Sizes and margins are fractions of each
// image's own dimensions, so one set of settings looks the same on a
// phone photo and a 4K render, and the small preview matches the
// full-size download exactly.
// -----------------------------------------------------------------------

export const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

export const FONTS = [
  { id: 'Arial, Helvetica, sans-serif', label: 'Sans-serif' },
  { id: 'Georgia, "Times New Roman", serif', label: 'Serif' },
  { id: '"Courier New", Courier, monospace', label: 'Monospace' },
  { id: 'Impact, "Arial Black", sans-serif', label: 'Impact' },
  { id: '"Brush Script MT", "Segoe Script", cursive', label: 'Script' },
];

export const DEFAULT_SETTINGS = {
  type: 'text', // 'text' | 'logo'
  text: '© Your Name',
  font: FONTS[0].id,
  bold: true,
  color: '#ffffff',
  outline: true,
  size: 6, // text height or logo width, % of the image (see below)
  opacity: 60, // %
  angle: 0, // degrees
  position: 'bottom-right', // or 'tile'
  margin: 3, // % of the shorter side
  tileGap: 100, // % of the watermark's own size, between tiles
};

// Draws the watermark onto `ctx`, which already holds the image at
// width x height. `logo` is a decoded <img> (only for type 'logo').
export function drawWatermark(ctx, width, height, s, logo) {
  const shortSide = Math.min(width, height);
  ctx.save();
  ctx.globalAlpha = s.opacity / 100;

  // Measure the mark: text height is a % of the shorter side; a logo's
  // width is a % of the image width.
  let markWidth;
  let markHeight;
  let fontPx = 0;
  if (s.type === 'logo') {
    if (!logo) {
      ctx.restore();
      return;
    }
    markWidth = (s.size / 100) * width * 3; // size 6% -> logo 18% of the width, a sensible default
    markHeight = markWidth * (logo.naturalHeight / logo.naturalWidth);
  } else {
    if (!s.text.trim()) {
      ctx.restore();
      return;
    }
    fontPx = Math.max(6, (s.size / 100) * shortSide);
    ctx.font = `${s.bold ? 'bold ' : ''}${fontPx}px ${s.font}`;
    markWidth = ctx.measureText(s.text).width;
    markHeight = fontPx;
  }

  const drawMark = () => {
    if (s.type === 'logo') {
      ctx.drawImage(logo, -markWidth / 2, -markHeight / 2, markWidth, markHeight);
      return;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s.outline) {
      // A thin contrasting outline keeps the text readable on both light
      // and dark parts of the photo.
      ctx.lineWidth = Math.max(1, fontPx / 14);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = isLight(s.color) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
      ctx.strokeText(s.text, 0, 0);
    }
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, 0, 0);
  };
  const angle = (s.angle * Math.PI) / 180;

  if (s.position === 'tile') {
    // Repeat across the whole image on a rotated grid. The grid is made
    // bigger than the image so rotation never leaves bare corners.
    const stepX = markWidth * (1 + s.tileGap / 100);
    const stepY = markHeight * (1 + s.tileGap / 100) * 2.2;
    const reach = Math.hypot(width, height);
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    let row = 0;
    for (let y = -reach; y <= reach; y += stepY, row++) {
      const offset = row % 2 ? stepX / 2 : 0; // brick pattern
      for (let x = -reach + offset; x <= reach; x += stepX) {
        ctx.save();
        ctx.translate(x, y);
        drawMark();
        ctx.restore();
      }
    }
    ctx.restore();
    return;
  }

  // Single mark: place its (rotated) bounding box inside the margins.
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const boxWidth = markWidth * cos + markHeight * sin;
  const boxHeight = markWidth * sin + markHeight * cos;
  const margin = (s.margin / 100) * shortSide;
  const [vertical, horizontal] = s.position === 'center' ? ['middle', 'center'] : s.position.split('-');
  const cx =
    horizontal === 'left' ? margin + boxWidth / 2 : horizontal === 'right' ? width - margin - boxWidth / 2 : width / 2;
  const cy =
    vertical === 'top' ? margin + boxHeight / 2 : vertical === 'bottom' ? height - margin - boxHeight / 2 : height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  drawMark();
  ctx.restore();
}

function isLight(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}

// Image + watermark at `scale` (1 = full resolution).
export function renderWatermarked(img, settings, logo, scale = 1, mime = 'image/png') {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawWatermark(ctx, canvas.width, canvas.height, settings, logo);
  return canvas;
}

export function watermarkedName(name, extension) {
  return `${name.replace(/\.[^./]+$/, '')}-watermarked.${extension}`;
}
