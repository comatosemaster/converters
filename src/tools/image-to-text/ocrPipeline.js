// The "make OCR actually work on real images" layer for Image to Text.
//
// Handing Tesseract the raw file works on clean, black-on-white scans and
// little else. A benchmark of screenshots, dark-mode UIs, coloured banners,
// transparent PNGs and phone photos showed the same few failure modes again
// and again, and each step below exists to fix one of them:
//
//   1. Transparent PNGs: transparent pixels are stored as black, so white
//      text on a transparent background became white-on-black garbage.
//      -> flatten onto a background that contrasts with the content.
//   2. Coloured backgrounds: Tesseract's own colour handling silently
//      dropped whole lines (e.g. light text on a green banner).
//      -> convert to grayscale ourselves.
//   3. Light text on dark backgrounds (dark mode, code editors).
//      -> detect the polarity and invert so text is always dark-on-light.
//   4. Small text (UI screenshots): letters only a few pixels tall get
//      misread ("turned" -> "tumed", "all" -> "al").
//   5. Huge photos: slow, with no accuracy benefit.
//      -> measure the text height first, then resize so text lands in the
//         size range Tesseract is trained on.
//   6. Shadows and uneven lighting in photos: one global black/white
//      threshold can't work when one corner of the page is darker than the
//      text in another.
//      -> "flat-field" the image: divide out a smooth estimate of the
//         paper brightness, so the background becomes uniformly white.
//   7. Junk "text" read out of table edges, paper borders and noise.
//      -> trim very-low-confidence fragments from the ends of lines.
//
// The tool component passes in an already-created tesseract.js worker, so
// this file never imports tesseract.js itself (that's loaded on demand).

// Tesseract reads best when a typical word is roughly this many pixels tall
// (measured from the top of the tallest letter to the bottom of the lowest).
// Found by benchmark: smaller targets misread small text, larger ones
// magnify noise and blur in photos.
const TARGET_WORD_HEIGHT = 26;

// Never resize beyond these factors - upscaling more than 4x invents no
// extra detail, and shrinking below 1/4 risks erasing small print that sits
// next to a huge headline.
const MAX_UPSCALE = 4;
const MIN_DOWNSCALE = 0.25;

// Caps on image size (in pixels), to keep memory and time sane on phones.
// The measuring pass only needs a rough look; the real pass gets more room.
const MEASURE_MAX_PIXELS = 4_000_000;
const FINAL_MAX_PIXELS = 12_000_000;

// Below this average confidence, a second attempt at a different scale is
// worth its cost - the better-scoring of the two results is kept. Clean
// images score 85-96 and never pay for the retry.
const RETRY_BELOW_CONFIDENCE = 75;

// A word is treated as junk (and trimmed off a line's ends) when Tesseract
// is this unsure about it AND it doesn't look like a real word.
const JUNK_WORD_CONFIDENCE = 35;
// A whole line is dropped only if Tesseract is this unsure about it overall.
const JUNK_LINE_CONFIDENCE = 30;

// --- Decoding ---------------------------------------------------------------

// Returns something drawable onto a canvas. `imageOrientation: 'from-image'`
// applies the EXIF rotation phone cameras store, so sideways photos are read
// upright. The <img> fallback covers formats createImageBitmap rejects in
// some browsers (notably SVG).
async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// --- Pixel helpers ----------------------------------------------------------

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Draws the image at the given size and returns one brightness value (0-255)
// per pixel. Transparent areas are filled with whichever of black/white
// contrasts with the visible content, so text on a transparent background
// stays readable whatever its colour.
//
// `angle` (radians) straightens a tilted photo; the corners that rotation
// uncovers are painted `fill` (the page's background brightness), so they
// don't show up as dark wedges that look like ink.
function toGrayscale(source, scale, { angle = 0, fill = 255 } = {}) {
  const drawWidth = Math.max(1, Math.round(source.width * scale));
  const drawHeight = Math.max(1, Math.round(source.height * scale));
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const width = angle ? Math.ceil(drawWidth * cos + drawHeight * sin) : drawWidth;
  const height = angle ? Math.ceil(drawWidth * sin + drawHeight * cos) : drawHeight;

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // Smooth, high-quality resampling - the default "nearest pixel" mode
  // makes upscaled letters blocky and jagged.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (angle) {
    ctx.fillStyle = `rgb(${fill}, ${fill}, ${fill})`;
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  } else {
    ctx.drawImage(source, 0, 0, drawWidth, drawHeight);
  }
  const { data } = ctx.getImageData(0, 0, width, height);
  const count = width * height;

  const luma = new Float32Array(count);
  let visibleSum = 0;
  let visibleWeight = 0;
  for (let i = 0; i < count; i++) {
    const alpha = data[i * 4 + 3] / 255;
    luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    visibleSum += alpha * luma[i];
    visibleWeight += alpha;
  }
  const matte = visibleWeight > 0 && visibleSum / visibleWeight > 128 ? 0 : 255;

  const gray = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) {
    const alpha = data[i * 4 + 3] / 255;
    gray[i] = alpha * luma[i] + (1 - alpha) * matte;
  }
  return { gray, width, height };
}

function grayscaleToCanvas({ gray, width, height }) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < gray.length; i++) {
    imageData.data[i * 4] = gray[i];
    imageData.data[i * 4 + 1] = gray[i];
    imageData.data[i * 4 + 2] = gray[i];
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// How grainy the image is: the typical brightness jump between neighbouring
// pixels, measured only in blank areas (tiles with no text), where a clean
// image is perfectly flat. Screenshots score ~0; camera photos taken in
// poor light score high.
function noiseLevel({ gray, width, height }) {
  const tile = 16;
  const scores = [];
  for (let top = 0; top + tile <= height; top += tile) {
    for (let left = 0; left + tile <= width; left += tile) {
      let min = 255;
      let max = 0;
      let jumps = 0;
      for (let y = top; y < top + tile; y++) {
        for (let x = left; x < left + tile; x++) {
          const v = gray[y * width + x];
          if (v < min) min = v;
          if (v > max) max = v;
          if (x > left) jumps += Math.abs(v - gray[y * width + x - 1]);
        }
      }
      if (max - min < 64) scores.push(jumps / (tile * (tile - 1)));
    }
  }
  if (!scores.length) return 0;
  scores.sort((a, b) => a - b);
  return scores[Math.floor(scores.length / 2)];
}

// A gentle 3x3 blur, which averages away grain (it's random from pixel to
// pixel) while letters, many pixels wide after resizing, survive it.
function smooth({ gray, width, height }) {
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += gray[yy * width + xx];
          count++;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return { gray: out, width, height };
}

function invert(gray) {
  for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];
}

// Is this light text on a dark background? Looked at tile by tile rather
// than across the whole image, because a shadow across a photo can make
// most of a white page darker than average - which fooled a whole-image
// check into inverting a perfectly normal page. Within one small tile that
// contains text, the background is still the majority of the pixels, so
// the tile's average sits closer to the background's brightness than to
// the ink's. Each tile votes; flat tiles (no text) don't get a vote.
function hasDarkBackground({ gray, width, height }) {
  const tile = Math.max(12, Math.round(Math.min(width, height) / 30));
  let lightVotes = 0;
  let darkVotes = 0;
  for (let top = 0; top < height; top += tile) {
    for (let left = 0; left < width; left += tile) {
      let min = 255;
      let max = 0;
      let sum = 0;
      let count = 0;
      for (let y = top; y < Math.min(top + tile, height); y++) {
        for (let x = left; x < Math.min(left + tile, width); x++) {
          const v = gray[y * width + x];
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
          count++;
        }
      }
      if (max - min < 48) continue;
      const mean = sum / count;
      if (max - mean < mean - min) lightVotes += count;
      else darkVotes += count;
    }
  }
  return darkVotes > lightVotes;
}

// Evens out shadows and uneven lighting. The paper's brightness at each
// spot is estimated as the brightest value nearby (text is dark and thin,
// so "brightest nearby" is the paper around it), smoothed into a gentle
// gradient; dividing every pixel by it turns the paper uniformly white
// while text stays dark. On images with an already-even background this
// changes almost nothing.
function flattenLighting({ gray, width, height }, tile = 16, radius = 2) {
  // Tile and radius are in pixels of the already-resized image, where text
  // is about TARGET_WORD_HEIGHT tall - so the default 16px tiles with a
  // 2-tile radius always reach past a letter's strokes to the paper around it.
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(height / tile);

  const tileMax = new Float32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const row = (y / tile) | 0;
    for (let x = 0; x < width; x++) {
      const t = row * cols + ((x / tile) | 0);
      const v = gray[y * width + x];
      if (v > tileMax[t]) tileMax[t] = v;
    }
  }

  const paper = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let brightest = 0;
      for (let dr = -radius; dr <= radius; dr++) {
        const r = row + dr;
        if (r < 0 || r >= rows) continue;
        for (let dc = -radius; dc <= radius; dc++) {
          const c = col + dc;
          if (c < 0 || c >= cols) continue;
          brightest = Math.max(brightest, tileMax[r * cols + c]);
        }
      }
      paper[row * cols + col] = Math.max(brightest, 1);
    }
  }

  // Blend smoothly between tile centres (bilinear interpolation) so the
  // correction has no visible tile edges.
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / tile - 0.5;
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
    const r1 = Math.min(rows - 1, r0 + 1);
    const ty = Math.max(0, Math.min(1, fy - r0));
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) / tile - 0.5;
      const c0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
      const c1 = Math.min(cols - 1, c0 + 1);
      const tx = Math.max(0, Math.min(1, fx - c0));
      const top = paper[r0 * cols + c0] * (1 - tx) + paper[r0 * cols + c1] * tx;
      const bottom = paper[r1 * cols + c0] * (1 - tx) + paper[r1 * cols + c1] * tx;
      const background = top * (1 - ty) + bottom * ty;
      out[y * width + x] = (gray[y * width + x] / background) * 255;
    }
  }
  return { gray: out, width, height };
}

// --- Tesseract result helpers -------------------------------------------------

function allLines(blocks) {
  const lines = [];
  for (const block of blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) lines.push(line);
    }
  }
  return lines;
}

function medianWordHeight(blocks) {
  const heights = [];
  for (const line of allLines(blocks)) {
    for (const word of line.words || []) {
      const h = word.bbox.y1 - word.bbox.y0;
      const w = word.bbox.x1 - word.bbox.x0;
      if (h > 2 && w > 2) heights.push(h);
    }
  }
  if (!heights.length) return 0;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}


// How far the text is tilted, in radians - the median slope of the
// baselines Tesseract found. Short lines are skipped; a two-letter line's
// baseline slope is mostly noise.
function skewAngle(blocks, wordHeight) {
  const angles = [];
  for (const line of allLines(blocks)) {
    const baseline = line.baseline;
    if (!baseline) continue;
    const dx = baseline.x1 - baseline.x0;
    if (dx < wordHeight * 4) continue;
    angles.push(Math.atan2(baseline.y1 - baseline.y0, dx));
  }
  if (!angles.length) return 0;
  angles.sort((a, b) => a - b);
  return angles[Math.floor(angles.length / 2)];
}

// Multi-column layouts (articles, papers, newsletters): Tesseract often
// reads straight across the gap between columns, gluing the first line of
// the left column to the first line of the right one. This finds column
// gutters itself - tall vertical strips of empty space that (almost) no
// line crosses - and returns the rectangles to read one at a time, in
// reading order: anything spanning the full width (a title), then each
// column top to bottom, then whatever comes after.
//
// Tables and receipts also have wide vertical gaps ("Latte ...... 4.50"),
// but reading those column by column would separate every item from its
// price. Two checks tell them apart: in real text columns the gap is
// narrow compared to the columns themselves, and lines run (nearly) all
// the way across their column.
//
// Returns null when the page is a single column - the normal case.
function findColumnRegions(blocks, width, height) {
  const wordHeight = medianWordHeight(blocks);
  if (!wordHeight) return null;

  const lines = allLines(blocks)
    .map((line) =>
      (line.words || [])
        .map((word) => word.bbox)
        .filter((box) => box.x1 - box.x0 > 2 && box.y1 - box.y0 > 2),
    )
    .filter((boxes) => boxes.length)
    .map((boxes) => ({
      boxes,
      top: Math.min(...boxes.map((box) => box.y0)),
      bottom: Math.max(...boxes.map((box) => box.y1)),
    }));
  if (lines.length < 3) return null;

  // For every x position, how many lines have a word there.
  const coverage = new Uint16Array(width + 1);
  const lastLine = new Int32Array(width + 1).fill(-1);
  let textLeft = width;
  let textRight = 0;
  lines.forEach((line, index) => {
    for (const box of line.boxes) {
      textLeft = Math.min(textLeft, box.x0);
      textRight = Math.max(textRight, box.x1);
      for (let x = Math.max(0, box.x0); x < Math.min(width, box.x1); x++) {
        if (lastLine[x] !== index) {
          lastLine[x] = index;
          coverage[x]++;
        }
      }
    }
  });

  // Candidate gutters: strips at least a word-height wide that at most a
  // few lines (a title, a footer) cross. Each gets a single cut line at its
  // emptiest point - the tolerance above also lets a strip creep into the
  // ragged ends of a column's lines, but its emptiest point is the real gap.
  const allowedCrossings = Math.max(2, Math.floor(lines.length * 0.2));
  const candidates = [];
  let start = -1;
  for (let x = textLeft; x <= textRight; x++) {
    const empty = coverage[x] <= allowedCrossings;
    if (empty && start < 0) start = x;
    if (!empty && start >= 0) {
      if (x - start >= wordHeight) {
        let fewest = Infinity;
        for (let i = start; i < x; i++) fewest = Math.min(fewest, coverage[i]);
        // The longest run at that lowest coverage; the cut goes in its middle.
        let best = { from: start, to: start };
        for (let i = start; i < x; i++) {
          if (coverage[i] !== fewest) continue;
          let j = i;
          while (j < x && coverage[j] === fewest) j++;
          if (j - i > best.to - best.from) best = { from: i, to: j };
          i = j;
        }
        candidates.push({ cut: Math.round((best.from + best.to) / 2), gap: best.to - best.from });
      }
      start = -1;
    }
  }
  if (!candidates.length) return null;

  // A line "crosses" a cut if a word sits on it, or if its words on either
  // side are only a normal word-space apart (a title that happens to have
  // a space right there). Column lines leave a much wider gap.
  const crosses = (line, cut) => {
    let leftEnd = -Infinity;
    let rightStart = Infinity;
    for (const box of line.boxes) {
      if (box.x0 <= cut && box.x1 >= cut) return true;
      if (box.x1 < cut) leftEnd = Math.max(leftEnd, box.x1);
      else rightStart = Math.min(rightStart, box.x0);
    }
    return rightStart - leftEnd < wordHeight;
  };

  const extent = (boxLists) => {
    const boxes = boxLists.flat();
    const left = Math.min(...boxes.map((box) => box.x0));
    const right = Math.max(...boxes.map((box) => box.x1));
    return { left, width: right - left };
  };

  const gutters = candidates.filter((gutter, i) => {
    const columnLeft = i > 0 ? candidates[i - 1].cut : 0;
    const columnRight = i < candidates.length - 1 ? candidates[i + 1].cut : width;
    const body = lines.filter((line) => !crosses(line, gutter.cut));
    const leftLines = body
      .map((line) => line.boxes.filter((box) => box.x0 >= columnLeft && box.x1 <= gutter.cut))
      .filter((boxes) => boxes.length);
    const rightLines = body
      .map((line) => line.boxes.filter((box) => box.x0 >= gutter.cut && box.x1 <= columnRight))
      .filter((boxes) => boxes.length);
    if (leftLines.length < 3 || rightLines.length < 3) return false;

    const leftColumn = extent(leftLines);
    const rightColumn = extent(rightLines);
    // Real text columns hold a couple of dozen characters per line - a
    // narrow sliver is a noisy photo's misread edge, or a table's values.
    if (Math.min(leftColumn.width, rightColumn.width) < wordHeight * 10) return false;
    if (gutter.gap * 3 > Math.min(leftColumn.width, rightColumn.width)) return false;

    // Column text is left-aligned: (nearly) every line of the right-hand
    // column starts at the same x. Right-aligned prices don't.
    const starts = rightLines.map((boxes) => Math.min(...boxes.map((box) => box.x0)));
    const aligned = starts.filter((x) => Math.abs(x - rightColumn.left) <= wordHeight / 2).length;
    if (aligned < starts.length * 0.7) return false;

    const fills = leftLines
      .map((boxes) => (Math.max(...boxes.map((box) => box.x1)) - leftColumn.left) / leftColumn.width)
      .sort((a, b) => a - b);
    return fills[Math.floor(fills.length / 2)] >= 0.6;
  });
  if (!gutters.length) return null;

  // Walk down the page, grouping lines into horizontal bands: "span" bands
  // cross a gutter (titles, captions), "columns" bands don't.
  const bands = [];
  for (const line of [...lines].sort((a, b) => a.top - b.top)) {
    const type = gutters.some((gutter) => crosses(line, gutter.cut)) ? 'span' : 'columns';
    const last = bands[bands.length - 1];
    if (last && last.type === type) {
      last.bottom = Math.max(last.bottom, line.bottom);
      last.lines++;
    } else {
      bands.push({ type, top: line.top, bottom: line.bottom, lines: 1 });
    }
  }
  // A lone line between two titles isn't worth splitting into columns.
  const merged = [];
  for (const band of bands) {
    if (band.type === 'columns' && band.lines < 2) band.type = 'span';
    const last = merged[merged.length - 1];
    if (last && last.type === band.type) last.bottom = Math.max(last.bottom, band.bottom);
    else merged.push({ ...band });
  }
  if (!merged.some((band) => band.type === 'columns')) return null;

  // Turn bands into rectangles that tile the whole page with no gaps, so
  // even text the layout pass missed still lands in some region.
  const cuts = gutters.map((gutter) => gutter.cut);
  const columnEdges = [0, ...cuts, width];
  const regions = [];
  merged.forEach((band, i) => {
    const top = i === 0 ? 0 : Math.round((merged[i - 1].bottom + band.top) / 2);
    const bottom = i === merged.length - 1 ? height : Math.round((band.bottom + merged[i + 1].top) / 2);
    if (bottom <= top) return;
    if (band.type === 'span') {
      regions.push({ left: 0, top, width, height: bottom - top });
    } else {
      for (let c = 0; c < columnEdges.length - 1; c++) {
        regions.push({ left: columnEdges[c], top, width: columnEdges[c + 1] - columnEdges[c], height: bottom - top });
      }
    }
  });
  // Very fragmented layouts cost a full read per region; not worth it.
  return regions.length <= 16 ? regions : null;
}

function looksLikeJunk(word) {
  if (word.confidence >= JUNK_WORD_CONFIDENCE) return false;
  const letters = (word.text.match(/[\p{L}\p{N}]/gu) || []).length;
  return letters <= 2 || letters / word.text.length < 0.5;
}

// Rebuilds the text from Tesseract's per-word results (one `blocks` list
// per region read), minus the junk: unsure fragments at either end of a
// line, and lines Tesseract was unsure about as a whole. Paragraphs are
// separated by a blank line, like Tesseract's own plain-text output.
function buildText(blockLists) {
  const paragraphs = [];
  let confidenceSum = 0;
  let wordCount = 0;
  let score = 0;
  for (const blocks of blockLists) {
    for (const block of blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        const keptLines = [];
        for (const line of paragraph.lines || []) {
          const words = (line.words || []).filter((w) => w.text.trim());
          while (words.length && looksLikeJunk(words[0])) words.shift();
          while (words.length && looksLikeJunk(words[words.length - 1])) words.pop();
          if (!words.length) continue;
          const lineConfidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
          if (lineConfidence < JUNK_LINE_CONFIDENCE) continue;
          keptLines.push(words.map((w) => w.text).join(' '));
          for (const w of words) {
            confidenceSum += w.confidence;
            score += (w.confidence / 100) * w.text.length;
          }
          wordCount += words.length;
        }
        if (keptLines.length) paragraphs.push(keptLines.join('\n'));
      }
    }
  }
  return {
    text: paragraphs.join('\n\n'),
    confidence: wordCount ? Math.round(confidenceSum / wordCount) : 0,
    // How much text was read, weighted by how sure Tesseract was of it.
    score,
  };
}

// Does the (lighting-corrected) page have flat, mid-grey areas - places
// with no text that still aren't white? Plain pages and corrected photos
// are white wherever there's no text; tinted UI panels are not.
function hasTintedPanels({ gray, width, height }) {
  const tile = 16;
  let tinted = 0;
  let total = 0;
  for (let top = 0; top + tile <= height; top += tile) {
    for (let left = 0; left + tile <= width; left += tile) {
      let min = 255;
      let max = 0;
      let sum = 0;
      for (let y = top; y < top + tile; y++) {
        for (let x = left; x < left + tile; x++) {
          const v = gray[y * width + x];
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
        }
      }
      const mean = sum / (tile * tile);
      total++;
      if (max - min < 24 && mean > 40 && mean < 215) tinted++;
    }
  }
  return total > 0 && tinted / total > 0.02;
}

// Copies one rectangle of the page into its own canvas, padded with white.
function cropWithMargin(page, left, top, width, height, margin) {
  if (width < 1 || height < 1) return null;
  const canvas = makeCanvas(width + margin * 2, height + margin * 2);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  imageData.data.fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = page.gray[(top + y) * page.width + left + x];
      const i = ((y + margin) * canvas.width + x + margin) * 4;
      imageData.data[i] = v;
      imageData.data[i + 1] = v;
      imageData.data[i + 2] = v;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Brightness of the page background: the bright end of the histogram for
// dark-on-light pages, the dark end for light-on-dark ones.
function backgroundLevel(gray, darkBackground) {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
  const target = gray.length * (darkBackground ? 0.1 : 0.9);
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= target) return v;
  }
  return 255;
}

// --- The pipeline ---------------------------------------------------------------

// Average neighbour-to-neighbour jump (0-255 scale) in blank areas above
// which an image counts as grainy and gets smoothed before reading.
const NOISY = 4;

// Tilts smaller than this aren't worth a resample; Tesseract copes.
const MIN_DESKEW = (0.5 * Math.PI) / 180;
// Tilts larger than this are more likely a misread layout than a real tilt.
const MAX_DESKEW = (20 * Math.PI) / 180;

// `tuning` exists only so the benchmark can switch individual steps off and
// measure what each one is worth; the tool itself never passes it.
export async function extractText(worker, file, { onStage = () => {}, tuning = {} } = {}) {
  const t = {
    resize: true,
    flatten: true,
    retry: true,
    deskew: true,
    columns: true,
    denoise: true,
    target: TARGET_WORD_HEIGHT,
    ...tuning,
  };

  onStage('Preparing image');
  const image = await decodeImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Image has no pixels');

  // Layout analysis only (no reading) is fast - it finds where the words
  // and lines are, which tells us text size, tilt and columns.
  async function analyseLayout(page) {
    const { data } = await worker.recognize(grayscaleToCanvas(page), {}, { text: false, layoutBlocks: true });
    return data.layoutBlocks || [];
  }

  try {
    onStage('Analyzing layout');
    // A capped-size grayscale copy, used to decide polarity and measure text.
    const measureScale = Math.min(1, Math.sqrt(MEASURE_MAX_PIXELS / (sourceWidth * sourceHeight)));
    let preview = toGrayscale(image, measureScale);
    const darkBackground = hasDarkBackground(preview);
    const grainy = t.denoise && noiseLevel(preview) > NOISY;
    const fill = backgroundLevel(preview.gray, darkBackground);
    if (darkBackground) invert(preview.gray);
    let layout = await analyseLayout(preview);

    let angle = 0;
    if (t.deskew) {
      const skew = skewAngle(layout, medianWordHeight(layout));
      if (Math.abs(skew) > MIN_DESKEW && Math.abs(skew) < MAX_DESKEW) {
        angle = -skew;
        preview = toGrayscale(image, measureScale, { angle, fill });
        if (darkBackground) invert(preview.gray);
        layout = await analyseLayout(preview);
      }
    }

    let scale = 1;
    if (t.resize) {
      const wordHeight = medianWordHeight(layout) / measureScale;
      if (wordHeight > 0) {
        scale = t.target / wordHeight;
      } else {
        // No text found at this size - often because it's too small to
        // detect at all. Enlarging small images gives it a second chance.
        scale = Math.max(sourceWidth, sourceHeight) < 1200 ? 2 : 1;
      }
      scale = Math.min(MAX_UPSCALE, Math.max(MIN_DOWNSCALE, scale));
      // Resampling isn't free (it softens edges a little), so skip it when
      // the text is already about the right size.
      if (scale > 0.8 && scale < 1.25) scale = 1;
    }

    const maxScale = Math.sqrt(FINAL_MAX_PIXELS / (sourceWidth * sourceHeight));

    // The page at scale `s`: grayscale, straightened, dark-on-light and
    // de-grained - everything except the lighting correction, which
    // readAtScale may want to try two ways.
    function preparePage(s) {
      let page = toGrayscale(image, Math.min(s, maxScale), { angle, fill });
      if (darkBackground) invert(page.gray);
      if (grainy) page = smooth(page);
      return page;
    }

    async function readPage(page) {
      // Columns are looked for on the page exactly as it will be read: the
      // lighting correction and smoothing have already erased the junk a
      // photo's paper edge produces, which otherwise passes for an extra
      // column and hides the real ones.
      const regions = t.columns
        ? findColumnRegions(await analyseLayout(page), page.width, page.height)
        : null;
      // Each region is read as its own small image with a white margin
      // around it - Tesseract garbles text that touches the edge of what it's
      // given (its own "rectangle" option does exactly that, which turned a
      // newsletter's title into gibberish).
      const margin = Math.round(t.target / 2);
      const images = regions
        ? regions.map((r) => cropWithMargin(page, r.left, r.top, r.width, r.height, margin))
        : [grayscaleToCanvas(page)];

      const results = [];
      for (const regionImage of images) {
        if (!regionImage) continue;
        const { data } = await worker.recognize(regionImage, {}, { text: true, blocks: true });
        results.push(data);
      }
      return buildText(results.map((d) => d.blocks));
    }

    async function readAtScale(s) {
      const page = preparePage(s);
      if (!t.flatten) return readPage(page);
      const flattened = flattenLighting(page);
      let result = await readPage(flattened);

      // Tinted panels (chat bubbles, buttons, banners) are a problem for
      // the lighting correction: it measures "paper" brightness over an
      // area wide enough to reach past the panel, so the panel stays grey,
      // and Tesseract's black/white split can swallow it whole, text and
      // all. A tighter correction fixes panels but slightly hurts photos
      // and fine print, so it's only tried when panels are present, and
      // only kept if it finds clearly more confidently-read text.
      if (hasTintedPanels(flattened)) {
        const alternative = await readPage(flattenLighting(page, 8, 1));
        if (alternative.score > result.score * 1.1 && alternative.confidence >= result.confidence - 5) {
          result = alternative;
        }
      }
      return result;
    }

    onStage('Reading text');
    let result = await readAtScale(scale);

    // Unsure result? Try once more at a different size and keep whichever
    // reading Tesseract is more confident in. Most often this rescues
    // noisy photos, where enlarging amplified the noise.
    if (t.retry && result.confidence < RETRY_BELOW_CONFIDENCE) {
      onStage('Double-checking');
      const alternative = await readAtScale(scale === 1 ? 2 : 1);
      if (alternative.confidence > result.confidence) result = alternative;
    }

    return { text: result.text, confidence: result.confidence };
  } finally {
    // ImageBitmaps hold decoded pixels outside JS memory until closed.
    if (image.close) image.close();
  }
}
