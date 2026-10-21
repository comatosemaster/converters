// -----------------------------------------------------------------------
// UUID LOGIC - no React. Generates version 4 (random) and version 7
// (time-ordered) UUIDs per RFC 9562, and decodes any pasted UUID.
// All randomness comes from crypto.getRandomValues - the browser's
// cryptographically secure generator, never Math.random().
// -----------------------------------------------------------------------

export const VERSIONS = [
  { id: 'v4', label: 'Version 4 (random)' },
  { id: 'v7', label: 'Version 7 (time-ordered)' },
];

export const FORMATS = [
  { id: 'standard', label: 'Standard', example: '8f14e45f-ceea-467f-a0e6-9b5d6c5f2a1b' },
  { id: 'compact', label: 'No hyphens', example: '8f14e45fceea467fa0e69b5d6c5f2a1b' },
  { id: 'braces', label: 'Braces', example: '{8f14e45f-ceea-467f-a0e6-9b5d6c5f2a1b}' },
  { id: 'urn', label: 'URN', example: 'urn:uuid:8f14e45f-ceea-467f-a0e6-9b5d6c5f2a1b' },
];

export const MAX_COUNT = 1000;

function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidV4() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant (10xx)
  return bytesToUuid(bytes);
}

// v7 = 48-bit Unix time in milliseconds, then random bits. Sorting v7 UUIDs
// sorts them by creation time, which keeps database indexes compact.
// Several generated within the same millisecond would otherwise sort
// randomly, so the 12 "rand_a" bits act as a counter within a millisecond
// (RFC 9562 section 6.2, method 1) to keep a batch in order.
let lastMs = -1;
let counter = 0;

export function uuidV7(now = Date.now()) {
  let ms = now;
  if (ms <= lastMs) {
    ms = lastMs;
    counter++;
    if (counter > 0xfff) {
      // Counter exhausted: borrow the next millisecond.
      ms = lastMs + 1;
      counter = 0;
    }
  } else {
    // Start each millisecond at a random point in the lower half, leaving
    // room to count upwards.
    counter = crypto.getRandomValues(new Uint16Array(1))[0] & 0x7ff;
  }
  lastMs = ms;

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // 48-bit timestamp, big-endian. (Split because JS bit operators are 32-bit.)
  const high = Math.floor(ms / 2 ** 16);
  const low = ms % 2 ** 16;
  bytes[0] = (high >>> 24) & 0xff;
  bytes[1] = (high >>> 16) & 0xff;
  bytes[2] = (high >>> 8) & 0xff;
  bytes[3] = high & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;
  bytes[6] = 0x70 | ((counter >>> 8) & 0x0f); // version 7 + counter high bits
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  return bytesToUuid(bytes);
}

export function generate(version, count) {
  const make = version === 'v7' ? uuidV7 : uuidV4;
  return Array.from({ length: count }, () => make());
}

export function formatUuid(uuid, format, uppercase) {
  let value = uppercase ? uuid.toUpperCase() : uuid;
  if (format === 'compact') value = value.replace(/-/g, '');
  if (format === 'braces') value = `{${value}}`;
  if (format === 'urn') value = `urn:uuid:${value}`;
  return value;
}

// --- Inspecting a pasted UUID ------------------------------------------------------

const VERSION_NAMES = {
  1: 'Version 1 (time + MAC address)',
  2: 'Version 2 (DCE security)',
  3: 'Version 3 (name-based, MD5)',
  4: 'Version 4 (random)',
  5: 'Version 5 (name-based, SHA-1)',
  6: 'Version 6 (time-ordered v1)',
  7: 'Version 7 (Unix time + random)',
  8: 'Version 8 (custom)',
};

// Returns { ok: false, error } or { ok: true, canonical, version, variant, timestamp? }.
export function inspectUuid(text) {
  const raw = text.trim().replace(/^urn:uuid:/i, '').replace(/^\{|\}$/g, '');
  const hex = raw.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex) || (raw.includes('-') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw))) {
    return { ok: false, error: 'Not a valid UUID - expected 32 hex digits, usually as 8-4-4-4-12.' };
  }
  const lower = hex.toLowerCase();
  const canonical = `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
  if (/^0+$/.test(lower)) return { ok: true, canonical, version: 'Nil UUID (all zeros)', variant: '—' };
  if (/^f+$/.test(lower)) return { ok: true, canonical, version: 'Max UUID (all ones)', variant: '—' };

  const versionDigit = parseInt(lower[12], 16);
  const variantBits = parseInt(lower[16], 16);
  const variant =
    variantBits < 8 ? 'NCS (legacy)' : variantBits < 12 ? 'RFC 9562 / RFC 4122' : variantBits < 14 ? 'Microsoft (legacy GUID)' : 'Reserved';
  const isStandard = variant === 'RFC 9562 / RFC 4122';
  const result = {
    ok: true,
    canonical,
    version: isStandard ? (VERSION_NAMES[versionDigit] ?? `Unknown version (${versionDigit})`) : '—',
    variant,
  };

  if (isStandard && versionDigit === 7) {
    result.timestamp = new Date(parseInt(lower.slice(0, 12), 16));
  } else if (isStandard && (versionDigit === 1 || versionDigit === 6)) {
    // 60-bit count of 100ns intervals since 1582-10-15 (the Gregorian reform).
    const timeHex =
      versionDigit === 1
        ? lower.slice(13, 16) + lower.slice(8, 12) + lower.slice(0, 8)
        : lower.slice(0, 12) + lower.slice(13, 16);
    const intervals = BigInt(`0x${timeHex}`);
    const ms = Number(intervals / 10000n) - 12219292800000;
    result.timestamp = new Date(ms);
  }
  return result;
}
