// -----------------------------------------------------------------------
// EXIF / METADATA LOGIC - no React.
//
// Reading uses the exifr library (loaded on demand). Removing is done by
// hand, by cutting the metadata blocks out of the file's own structure -
// the image data itself is copied byte for byte, so there is zero quality
// loss (unlike "save as a new image" approaches, which re-compress).
//
//   JPEG: a sequence of marked segments. Metadata lives in APP1 (EXIF,
//         XMP), APP13 (IPTC/Photoshop), COM (comments) and other vendor
//         APPn blocks; anything after the end-of-image marker (motion
//         photo videos, depth maps - which carry their own metadata) is
//         cut off too.
//   PNG:  a sequence of chunks; text chunks (tEXt/zTXt/iTXt), eXIf and
//         tIME are dropped.
//   WebP: a RIFF container; EXIF and XMP chunks are dropped and the
//         header flags/size are updated to match.
// -----------------------------------------------------------------------

export const SUPPORTED_REMOVE = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

export function detectFormat(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

// --- Reading ---------------------------------------------------------------------

let exifrPromise = null;
function loadExifr() {
  if (!exifrPromise) exifrPromise = import('exifr').then((m) => m.default ?? m);
  return exifrPromise;
}

// exifr can't read WebP files, but a WebP's EXIF chunk is an ordinary TIFF
// block (sometimes with an "Exif\0\0" prefix) that exifr understands.
function webpExifBlock(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(...bytes.subarray(i, i + 4));
    const size = view.getUint32(i + 4, true);
    if (fourcc === 'EXIF') {
      const data = bytes.subarray(i + 8, i + 8 + size);
      return startsWith(data, 0, 'Exif\0\0') ? data.subarray(6) : data;
    }
    i += 8 + size + (size % 2);
  }
  return null;
}

// PNG text chunks ("Author", "Comment", "Description"...) that exifr
// doesn't report, as { 'PNG Author': 'Jane', ... }. Compressed (zTXt) or
// compressed-iTXt text isn't inflated here - it's just listed as present.
function pngTextChunks(bytes) {
  const out = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8');
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const data = bytes.subarray(i + 8, i + 8 + length);
    const nul = data.indexOf(0);
    const keyword = nul > 0 ? latin1.decode(data.subarray(0, nul)) : '';
    if (type === 'tEXt' && keyword) {
      out[`PNG ${keyword}`] = latin1.decode(data.subarray(nul + 1));
    } else if (type === 'zTXt' && keyword) {
      out[`PNG ${keyword}`] = '(compressed text)';
    } else if (type === 'iTXt' && keyword) {
      const compressed = data[nul + 1] === 1;
      let p = nul + 3;
      p = data.indexOf(0, p) + 1; // language tag
      p = data.indexOf(0, p) + 1; // translated keyword
      out[`PNG ${keyword}`] = compressed ? '(compressed text)' : utf8.decode(data.subarray(p));
    }
    if (type === 'IEND') break;
    i += 12 + length;
  }
  return out;
}

// Everything exifr can find, as one flat object (or {} if none). The ICC
// color profile isn't included: it describes the image's colors, holds
// nothing personal, and is kept by default when cleaning.
export async function readMetadata(bytes) {
  const exifr = await loadExifr();
  const format = detectFormat(bytes);
  let source = bytes;
  if (format === 'image/webp') {
    source = webpExifBlock(bytes);
    if (!source) return {};
  }
  const extra = format === 'image/png' ? pngTextChunks(bytes) : {};
  try {
    const data = await exifr.parse(source, {
      tiff: true,
      exif: true,
      gps: true,
      interop: true,
      ifd1: true,
      xmp: true,
      iptc: true,
      icc: false,
      jfif: false,
      ihdr: false,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
    });
    return { ...(data ?? {}), ...extra };
  } catch {
    return extra;
  }
}

// Turns raw metadata into a short, readable summary.
export function summarize(meta) {
  const join = (...parts) => parts.filter(Boolean).join(' ');
  const rows = [];
  // Many models already start with the brand ("Canon EOS R5") - don't say it twice.
  const make = meta.Make ? String(meta.Make).trim() : '';
  const model = meta.Model ? String(meta.Model).trim() : '';
  const camera = make && model.toLowerCase().startsWith(make.toLowerCase()) ? model : join(make, model);
  if (camera) rows.push(['Camera', camera]);
  if (meta.LensModel) rows.push(['Lens', meta.LensModel]);
  const taken = meta.DateTimeOriginal ?? meta.CreateDate ?? meta.DateTime ?? meta.ModifyDate;
  if (taken) rows.push(['Taken', formatValue(taken)]);
  const settings = [
    meta.FNumber && `f/${meta.FNumber}`,
    meta.ExposureTime && (meta.ExposureTime < 1 ? `1/${Math.round(1 / meta.ExposureTime)}s` : `${meta.ExposureTime}s`),
    meta.ISO && `ISO ${meta.ISO}`,
    meta.FocalLength && `${meta.FocalLength}mm`,
  ].filter(Boolean);
  if (settings.length) rows.push(['Settings', settings.join(' · ')]);
  if (meta.Software) rows.push(['Software', meta.Software]);
  if (meta.Artist || meta.Creator) rows.push(['Author', formatValue(meta.Artist ?? meta.Creator)]);
  if (meta.Copyright || meta.Rights) rows.push(['Copyright', formatValue(meta.Copyright ?? meta.Rights)]);
  if (meta.ImageDescription) rows.push(['Description', formatValue(meta.ImageDescription)]);
  if (meta.HostComputer) rows.push(['Device', meta.HostComputer]);
  if (meta.SerialNumber || meta.BodySerialNumber) rows.push(['Serial number', String(meta.SerialNumber ?? meta.BodySerialNumber)]);
  const hasGps = Number.isFinite(meta.latitude) && Number.isFinite(meta.longitude);
  return {
    rows,
    gps: hasGps ? { latitude: meta.latitude, longitude: meta.longitude, altitude: meta.GPSAltitude } : null,
    orientation: typeof meta.Orientation === 'number' ? meta.Orientation : orientationNumber(meta.Orientation),
    tagCount: Object.keys(meta).length,
  };
}

// exifr translates Orientation into words; map them back to EXIF's 1-8.
const ORIENTATIONS = [
  'Horizontal (normal)',
  'Mirror horizontal',
  'Rotate 180',
  'Mirror vertical',
  'Mirror horizontal and rotate 270 CW',
  'Rotate 90 CW',
  'Mirror horizontal and rotate 90 CW',
  'Rotate 270 CW',
];
function orientationNumber(value) {
  const index = ORIENTATIONS.indexOf(value);
  return index >= 0 ? index + 1 : 1;
}

export function formatValue(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return `(${value.byteLength} bytes of binary data)`;
  if (Array.isArray(value)) {
    const shown = value.slice(0, 8).map(formatValue).join(', ');
    return value.length > 8 ? `${shown}, … (${value.length} values)` : shown;
  }
  if (value && typeof value === 'object') {
    if ('value' in value && Object.keys(value).length <= 2) return formatValue(value.value);
    return JSON.stringify(value).slice(0, 200);
  }
  return String(value);
}

// All tags as sorted [name, readable value] pairs, for the full table.
export function allTags(meta) {
  return Object.entries(meta)
    .map(([key, value]) => [key, formatValue(value)])
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
}

// --- Removing: JPEG -----------------------------------------------------------------

const readU16 = (bytes, i) => (bytes[i] << 8) | bytes[i + 1];
const startsWith = (bytes, offset, text) => [...text].every((ch, i) => bytes[offset + i] === ch.charCodeAt(0));

// A minimal EXIF block holding only the Orientation tag. Without it, a
// phone photo stored sideways (and displayed upright because of this one
// tag) would suddenly show up sideways after cleaning.
function orientationSegment(orientation) {
  const payload = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD0 at offset 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1, value
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const length = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

function stripJpeg(bytes, { keepColorProfile, orientation }) {
  const parts = [bytes.subarray(0, 2)]; // SOI
  const removed = [];
  let i = 2;
  let insertedOrientation = false;
  const addOrientation = () => {
    if (!insertedOrientation && orientation > 1 && orientation <= 8) {
      parts.push(orientationSegment(orientation));
      insertedOrientation = true;
    }
  };

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('This JPEG file looks damaged.');
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      // End of image. Anything after it is extra data (motion photo video,
      // depth map, a second embedded image) - not part of this picture.
      parts.push(bytes.subarray(i, i + 2));
      if (i + 2 < bytes.length) removed.push(`${bytes.length - i - 2} bytes of extra data after the image`);
      break;
    }
    const length = readU16(bytes, i + 2);
    const end = i + 2 + length;
    const body = i + 4;
    let keep = true;
    let label = '';
    if (marker === 0xe1) {
      keep = false;
      label = startsWith(bytes, body, 'Exif') ? 'EXIF' : startsWith(bytes, body, 'http://ns.adobe.com/xap') ? 'XMP' : 'APP1';
    } else if (marker === 0xe2) {
      // ICC color profile - removing it can shift colors, so it's kept unless asked.
      const isIcc = startsWith(bytes, body, 'ICC_PROFILE');
      keep = isIcc && keepColorProfile;
      label = isIcc ? 'color profile' : 'APP2 (multi-picture/FlashPix)';
    } else if (marker === 0xed) {
      keep = false;
      label = 'IPTC / Photoshop';
    } else if (marker === 0xfe) {
      keep = false;
      label = 'comment';
    } else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) {
      // Vendor APPn blocks (camera makers' notes, etc). APP14 "Adobe" stays:
      // it tells decoders how the colors are encoded.
      keep = false;
      label = `APP${marker - 0xe0}`;
    }

    if (marker !== 0xe0) addOrientation(); // after JFIF (APP0), before everything else
    if (keep) parts.push(bytes.subarray(i, end));
    else removed.push(label);

    if (marker === 0xda) {
      // Start of scan: compressed image data follows, up to the next marker.
      let j = end;
      while (j < bytes.length - 1) {
        if (bytes[j] === 0xff && bytes[j + 1] !== 0x00 && !(bytes[j + 1] >= 0xd0 && bytes[j + 1] <= 0xd7)) break;
        j++;
      }
      parts.push(bytes.subarray(end, j));
      i = j;
    } else {
      i = end;
    }
  }
  return { parts, removed };
}

// --- Removing: PNG -------------------------------------------------------------------

const PNG_METADATA = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(bytes, { keepColorProfile }) {
  const parts = [bytes.subarray(0, 8)];
  const removed = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const end = i + 12 + length;
    const drop = PNG_METADATA.has(type) || (type === 'iCCP' && !keepColorProfile);
    if (drop) removed.push(type === 'iCCP' ? 'color profile' : `${type} chunk`);
    else parts.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') {
      if (i < bytes.length) removed.push(`${bytes.length - i} bytes of extra data after the image`);
      break;
    }
  }
  return { parts, removed };
}

// --- Removing: WebP ------------------------------------------------------------------

function stripWebp(bytes, { keepColorProfile }) {
  const removed = [];
  const chunks = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(...bytes.subarray(i, i + 4));
    const size = view.getUint32(i + 4, true);
    const end = i + 8 + size + (size % 2);
    const drop = fourcc === 'EXIF' || fourcc === 'XMP ' || (fourcc === 'ICCP' && !keepColorProfile);
    if (drop) removed.push(fourcc === 'ICCP' ? 'color profile' : fourcc.trim());
    else chunks.push(bytes.slice(i, Math.min(end, bytes.length)));
    i = end;
  }
  // VP8X carries flags announcing which optional chunks exist; clear the
  // ones we removed so decoders don't go looking for them.
  for (const chunk of chunks) {
    if (String.fromCharCode(...chunk.subarray(0, 4)) === 'VP8X') {
      chunk[8] &= ~0x0c; // EXIF (0x08) and XMP (0x04)
      if (!keepColorProfile) chunk[8] &= ~0x20; // ICC (0x20)
    }
  }
  const total = 4 + chunks.reduce((sum, c) => sum + c.length, 0);
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46]); // RIFF
  new DataView(header.buffer).setUint32(4, total, true);
  header.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return { parts: [header, ...chunks], removed };
}

/**
 * Removes metadata from a JPEG, PNG or WebP file's bytes.
 * Returns { blob, removed: [labels], removedBytes }.
 */
export function stripMetadata(bytes, { keepColorProfile = true, orientation = 1 } = {}) {
  const format = detectFormat(bytes);
  if (!format) throw new Error('Metadata can only be removed from JPG, PNG and WebP files.');
  const result =
    format === 'image/jpeg'
      ? stripJpeg(bytes, { keepColorProfile, orientation })
      : format === 'image/png'
        ? stripPng(bytes, { keepColorProfile })
        : stripWebp(bytes, { keepColorProfile });
  const blob = new Blob(result.parts, { type: format });
  // Collapse repeats ("EXIF, XMP, XMP" -> "EXIF, XMP (2)").
  const counts = {};
  for (const label of result.removed) counts[label] = (counts[label] ?? 0) + 1;
  const removed = Object.entries(counts).map(([label, n]) => (n > 1 ? `${label} (${n})` : label));
  return { blob, format, removed, removedBytes: bytes.length - blob.size };
}

export function cleanedName(name) {
  return name.replace(/(\.[^./]+)?$/, (ext) => `-clean${ext || ''}`);
}
