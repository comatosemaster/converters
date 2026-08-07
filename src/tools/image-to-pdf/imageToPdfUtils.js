// -----------------------------------------------------------------------
// IMAGE -> PDF LOGIC - no React, no UI. Kept separate from ImageToPdf.jsx
// so the validation/layout/PDF-generation logic can be read (or reused)
// independently of the component, matching the pattern used by
// imageToBase64Utils.js and imageFlipUtils.js.
// -----------------------------------------------------------------------

import { jsPDF } from 'jspdf';

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_PIXELS = 40_000_000; // see imageFlipUtils.js for why this ceiling
const MAX_IMAGES = 100; // a generous cap - past this, generation gets slow and the list UI gets unwieldy

// Standard page sizes in millimeters (portrait: [width, height]). "Auto"
// isn't in this table - it's resolved per-page from the image(s) on it,
// see resolvePageDimensions() below.
export const PAGE_SIZES = {
  a4: { label: 'A4', width: 210, height: 297 },
  a3: { label: 'A3', width: 297, height: 420 },
  letter: { label: 'Letter', width: 215.9, height: 279.4 },
  legal: { label: 'Legal', width: 215.9, height: 355.6 },
  auto: { label: 'Auto (match image size)', width: null, height: null },
};

export const ORIENTATIONS = {
  portrait: 'Portrait',
  landscape: 'Landscape',
  auto: 'Auto',
};

// Margin sizes in millimeters.
export const MARGINS = {
  none: { label: 'None', mm: 0 },
  small: { label: 'Small', mm: 8 },
  medium: { label: 'Medium', mm: 16 },
  large: { label: 'Large', mm: 24 },
};

export const FIT_MODES = {
  fit: 'Fit to page',
  fill: 'Fill page',
  original: 'Original size',
};

// `jpegQuality: null` means "embed losslessly as PNG" - only High Quality
// does this, since PNG can be several times larger than JPEG.
export const QUALITY_PRESETS = {
  high: { label: 'High Quality (largest PDF)', jpegQuality: null, maxDimension: null },
  balanced: { label: 'Balanced (recommended)', jpegQuality: 0.8, maxDimension: 2400 },
  smallest: { label: 'Smallest File', jpegQuality: 0.45, maxDimension: 1600 },
};

export const LAYOUTS = [1, 2, 4, 6];

export const PAGE_NUMBER_POSITIONS = {
  none: 'No page numbers',
  'bottom-center': 'Bottom Center',
  'bottom-right': 'Bottom Right',
};

// A rough guess at points-per-pixel for "Original size" placement, and for
// estimating output size - images don't carry a real physical DPI in the
// browser, so 96 DPI (the standard CSS pixel density) is the conventional
// assumption.
const MM_PER_PX = 25.4 / 96;

let nextId = 1;

// --- Validation ----------------------------------------------------------

// Checks a File before we try to do anything with it. Returns
// `{ ok: true }` or `{ ok: false, error }` - never throws.
export function validateImageFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `That file is too large to add safely (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).`,
    };
  }
  const looksSupported =
    SUPPORTED_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!looksSupported) {
    return { ok: false, error: 'Unsupported file type - please choose a PNG, JPG, or WebP image.' };
  }
  return { ok: true, error: '' };
}

function validateImageDimensions(width, height) {
  if (width * height > MAX_PIXELS) {
    const megapixels = Math.round((width * height) / 1_000_000);
    return {
      ok: false,
      error: `This image is ${width}×${height} (~${megapixels} megapixels) - too large to add reliably. Try a smaller image.`,
    };
  }
  return { ok: true, error: '' };
}

// --- Loading ---------------------------------------------------------------

// Decodes a File into an <img> and reads its natural dimensions - this is
// also what catches corrupted files that pass the extension/mime check
// above but aren't actually decodable images.
function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode this file as an image - it may be corrupted.'));
    img.src = url;
  });
}

// Validates and decodes a batch of Files, returning one entry per file:
// `{ ok: true, item }` for a usable image, or `{ ok: false, name, error }`
// for one that was rejected - so the caller can report failures for some
// files without losing the ones that succeeded.
export async function loadImages(files) {
  const results = [];
  for (const file of files) {
    if (results.filter((r) => r.ok).length >= MAX_IMAGES) {
      results.push({ ok: false, name: file.name, error: `Only up to ${MAX_IMAGES} images are supported.` });
      continue;
    }

    const fileCheck = validateImageFile(file);
    if (!fileCheck.ok) {
      results.push({ ok: false, name: file.name, error: fileCheck.error });
      continue;
    }

    const url = URL.createObjectURL(file);
    try {
      const img = await decodeImage(url);
      const dimensionCheck = validateImageDimensions(img.naturalWidth, img.naturalHeight);
      if (!dimensionCheck.ok) {
        URL.revokeObjectURL(url);
        results.push({ ok: false, name: file.name, error: dimensionCheck.error });
        continue;
      }
      results.push({
        ok: true,
        item: {
          id: nextId++,
          file,
          url,
          width: img.naturalWidth,
          height: img.naturalHeight,
        },
      });
    } catch (decodeError) {
      URL.revokeObjectURL(url);
      results.push({ ok: false, name: file.name, error: decodeError.message });
    }
  }
  return results;
}

// Moves the image at `fromIndex` to `toIndex`, leaving every other image in
// its relative order - used by both drag-and-drop reordering and the
// keyboard-accessible "Move up"/"Move down" buttons.
export function reorderImages(images, fromIndex, toIndex) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= images.length ||
    toIndex >= images.length
  ) {
    return images;
  }
  const next = images.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function clearImages(images) {
  images.forEach((image) => URL.revokeObjectURL(image.url));
  return [];
}

// --- Layout ------------------------------------------------------------

// Chooses a grid (columns x rows) for a given "images per page" count,
// picking whichever arrangement best matches the page's own orientation -
// e.g. 2 images side-by-side on a landscape page, stacked on a portrait
// one - rather than always using the same grid regardless of page shape.
export function calculatePageLayout(pageWidthMm, pageHeightMm, marginMm, imagesPerPage) {
  const isLandscape = pageWidthMm >= pageHeightMm;
  const grids = {
    1: { cols: 1, rows: 1 },
    2: isLandscape ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 },
    4: { cols: 2, rows: 2 },
    6: isLandscape ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 },
  };
  const { cols, rows } = grids[imagesPerPage] ?? grids[1];

  const usableWidth = pageWidthMm - marginMm * 2;
  const usableHeight = pageHeightMm - marginMm * 2;
  // A small gutter between cells so adjacent images don't touch.
  const gutter = marginMm > 0 ? Math.min(marginMm / 2, 6) : 4;
  const cellWidth = (usableWidth - gutter * (cols - 1)) / cols;
  const cellHeight = (usableHeight - gutter * (rows - 1)) / rows;

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        x: marginMm + col * (cellWidth + gutter),
        y: marginMm + row * (cellHeight + gutter),
        width: cellWidth,
        height: cellHeight,
      });
    }
  }
  return { cols, rows, cells };
}

// Resolves the actual page width/height in mm for one page's worth of
// images, honoring "Auto" page size (matches the image's own aspect ratio,
// scaled to a standard A4-ish area) and "Auto" orientation (follows
// whichever way the image is wider).
function resolvePageDimensions(pageSizeId, orientationId, pageImages) {
  let width;
  let height;

  if (pageSizeId === 'auto') {
    // "Auto" only has a single unambiguous image to match when there's one
    // image on the page - for multi-image layouts there's no single
    // "the" image size, so fall back to A4 as a sensible default area.
    const reference = pageImages.length === 1 ? pageImages[0] : null;
    if (reference) {
      width = reference.width * MM_PER_PX;
      height = reference.height * MM_PER_PX;
    } else {
      ({ width, height } = PAGE_SIZES.a4);
    }
  } else {
    ({ width, height } = PAGE_SIZES[pageSizeId] ?? PAGE_SIZES.a4);
  }

  let wantLandscape;
  if (orientationId === 'landscape') wantLandscape = true;
  else if (orientationId === 'portrait') wantLandscape = false;
  else {
    // Auto: follow the majority aspect ratio of the images on this page.
    const landscapeCount = pageImages.filter((img) => img.width >= img.height).length;
    wantLandscape = landscapeCount >= pageImages.length / 2;
  }

  const isCurrentlyLandscape = width >= height;
  if (wantLandscape !== isCurrentlyLandscape) [width, height] = [height, width];

  return { width, height };
}

// --- Compression -----------------------------------------------------------

export function calculateImageQuality(qualityPresetId) {
  return QUALITY_PRESETS[qualityPresetId] ?? QUALITY_PRESETS.balanced;
}

// Draws `img` onto a canvas (downscaling first if it's bigger than the
// preset's max dimension), then exports it as a data URL - PNG for
// lossless "High Quality", JPEG at a lower quality for the other presets.
// PDFs have no transparency concept for page content, so JPEG output
// always gets a white background first, matching how this project's other
// tools handle exporting transparent images to a non-transparent format.
export function compressImage(img, qualityPresetId) {
  const preset = calculateImageQuality(qualityPresetId);
  let { width, height } = img;

  if (preset.maxDimension && Math.max(width, height) > preset.maxDimension) {
    const scale = preset.maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const format = preset.jpegQuality === null ? 'image/png' : 'image/jpeg';
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl =
    format === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', preset.jpegQuality);

  return { dataUrl, format, width, height };
}

// Crops `img` (centered) to exactly match `targetAspect` (width/height) -
// used by "Fill page", so the image can be stretched to a cell's exact
// size afterward without distorting it.
function cropToAspect(img, targetAspect) {
  const sourceAspect = img.naturalWidth / img.naturalHeight;
  let sx = 0;
  let sy = 0;
  let sWidth = img.naturalWidth;
  let sHeight = img.naturalHeight;

  if (sourceAspect > targetAspect) {
    // Source is relatively wider than the target - crop its sides.
    sWidth = Math.round(img.naturalHeight * targetAspect);
    sx = Math.round((img.naturalWidth - sWidth) / 2);
  } else {
    // Source is relatively taller than the target - crop top/bottom.
    sHeight = Math.round(img.naturalWidth / targetAspect);
    sy = Math.round((img.naturalHeight - sHeight) / 2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = sWidth;
  canvas.height = sHeight;
  canvas.getContext('2d').drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
  return canvas;
}

// --- PDF generation ----------------------------------------------------

// Prints page numbers on every page of an already-built document. Runs as
// a separate final pass (rather than inline while adding pages) so the
// total page count is known up front for "3 of 12"-less, plain "3" style
// numbering.
export function addPageNumbers(doc, pageCount, position, pageDimensionsByPage) {
  if (position === 'none') return;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    doc.setPage(pageNumber);
    const { width, height } = pageDimensionsByPage[pageNumber - 1];
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const label = String(pageNumber);
    const y = height - 6;
    if (position === 'bottom-center') {
      doc.text(label, width / 2, y, { align: 'center' });
    } else {
      doc.text(label, width - 8, y, { align: 'right' });
    }
  }
}

// Builds the whole PDF and returns it as a Blob. `images` must already be
// in their final display order. `onProgress(current, total)` is optional,
// used to drive a progress indicator for large batches.
export async function generatePdf({
  images,
  pageSizeId,
  orientationId,
  marginId,
  fitMode,
  layoutCount,
  qualityPresetId,
  pageNumbering,
  onProgress,
}) {
  if (images.length === 0) throw new Error('Add at least one image first.');

  const marginMm = MARGINS[marginId]?.mm ?? MARGINS.none.mm;
  const pageGroups = [];
  for (let i = 0; i < images.length; i += layoutCount) {
    pageGroups.push(images.slice(i, i + layoutCount));
  }

  let doc;
  const pageDimensionsByPage = [];

  for (let pageIndex = 0; pageIndex < pageGroups.length; pageIndex++) {
    const pageImages = pageGroups[pageIndex];
    const { width, height } = resolvePageDimensions(pageSizeId, orientationId, pageImages);
    pageDimensionsByPage.push({ width, height });

    if (pageIndex === 0) {
      doc = new jsPDF({
        orientation: width >= height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [width, height],
      });
    } else {
      doc.addPage([width, height], width >= height ? 'landscape' : 'portrait');
    }

    const { cells } = calculatePageLayout(width, height, marginMm, layoutCount);

    for (let cellIndex = 0; cellIndex < pageImages.length; cellIndex++) {
      const imageEntry = pageImages[cellIndex];
      const cell = cells[cellIndex];
      // eslint-disable-next-line no-await-in-loop -- pages must be drawn in order, one at a time
      const img = await decodeImage(imageEntry.url);

      let drawImg = img;
      let targetX = cell.x;
      let targetY = cell.y;
      let targetWidth = cell.width;
      let targetHeight = cell.height;

      if (fitMode === 'fit') {
        const scale = Math.min(cell.width / img.naturalWidth, cell.height / img.naturalHeight);
        targetWidth = img.naturalWidth * scale;
        targetHeight = img.naturalHeight * scale;
        targetX = cell.x + (cell.width - targetWidth) / 2;
        targetY = cell.y + (cell.height - targetHeight) / 2;
      } else if (fitMode === 'fill') {
        drawImg = cropToAspect(img, cell.width / cell.height);
      } else {
        // Original size, in mm at 96dpi - clamped so it never overflows
        // the cell it was assigned, just centered within it.
        const naturalWidthMm = img.naturalWidth * MM_PER_PX;
        const naturalHeightMm = img.naturalHeight * MM_PER_PX;
        const scale = Math.min(1, cell.width / naturalWidthMm, cell.height / naturalHeightMm);
        targetWidth = naturalWidthMm * scale;
        targetHeight = naturalHeightMm * scale;
        targetX = cell.x + (cell.width - targetWidth) / 2;
        targetY = cell.y + (cell.height - targetHeight) / 2;
      }

      // `drawImg` is either the decoded <img> itself, or the <canvas>
      // cropToAspect() produced - both are valid drawImage() sources and
      // both expose the same .width/.height shape compressImage() reads.
      const { dataUrl, format } = compressImage(drawImg, qualityPresetId);
      doc.addImage(
        dataUrl,
        format === 'image/png' ? 'PNG' : 'JPEG',
        targetX,
        targetY,
        targetWidth,
        targetHeight,
      );
    }

    onProgress?.(pageIndex + 1, pageGroups.length);
  }

  addPageNumbers(doc, pageGroups.length, pageNumbering, pageDimensionsByPage);

  return doc.output('blob');
}
