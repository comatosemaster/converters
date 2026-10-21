// -----------------------------------------------------------------------
// HASH LOGIC - no React. SHA-1/256/384/512 come from the browser's built-in
// Web Crypto API (fast, native, audited). Web Crypto deliberately leaves
// out MD5 because it's broken for security, but MD5 checksums are still
// everywhere (download pages, legacy systems), so it's implemented here
// from RFC 1321.
// -----------------------------------------------------------------------

export const ALGORITHMS = [
  { id: 'MD5', label: 'MD5', bits: 128, weak: true },
  { id: 'SHA-1', label: 'SHA-1', bits: 160, weak: true },
  { id: 'SHA-256', label: 'SHA-256', bits: 256, weak: false },
  { id: 'SHA-384', label: 'SHA-384', bits: 384, weak: false },
  { id: 'SHA-512', label: 'SHA-512', bits: 512, weak: false },
];

// Hashing reads the whole file into memory; past this, a browser tab
// (especially on a phone) is likely to run out.
export const MAX_FILE_SIZE = 512 * 1024 * 1024;

// --- MD5 (RFC 1321) -------------------------------------------------------------

// Per-round shift amounts and the sine-derived constants from the RFC.
const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(bytes) {
  // Padding: a 1 bit, zeros, then the message length in bits (64-bit,
  // little-endian), bringing the total to a multiple of 64 bytes.
  const length = bytes.length;
  const padded = new Uint8Array(((length + 8) >> 6) * 64 + 64);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (length * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(length / 0x20000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const M = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((word, i) => outView.setUint32(i * 4, word, true));
  return out;
}

// --- Hashing and HMAC -----------------------------------------------------------

export async function digest(algorithm, bytes) {
  if (algorithm === 'MD5') return md5(bytes);
  return new Uint8Array(await crypto.subtle.digest(algorithm, bytes));
}

// HMAC ("hash-based message authentication code") mixes a secret key into
// the hash, so only someone with the key can produce or check it. Used for
// API request signing and webhooks.
export async function hmac(algorithm, keyBytes, bytes) {
  if (algorithm === 'MD5') {
    // RFC 2104 by hand, since Web Crypto has no MD5.
    const blockSize = 64;
    let key = keyBytes.length > blockSize ? md5(keyBytes) : keyBytes;
    const padded = new Uint8Array(blockSize);
    padded.set(key);
    key = padded;
    const inner = new Uint8Array(blockSize + bytes.length);
    const outer = new Uint8Array(blockSize + 16);
    for (let i = 0; i < blockSize; i++) {
      inner[i] = key[i] ^ 0x36;
      outer[i] = key[i] ^ 0x5c;
    }
    inner.set(bytes, blockSize);
    outer.set(md5(inner), blockSize);
    return md5(outer);
  }
  // Web Crypto refuses empty HMAC keys; an all-zero block is equivalent.
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.length ? keyBytes : new Uint8Array(1),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, bytes));
}

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Normalises a pasted hash for comparison: trims, drops spaces/colons
// (some tools print "ab:cd:ef") and ignores hex letter case.
export function normalizeHash(text, encoding) {
  const trimmed = text.trim().replace(/[\s:]/g, '');
  return encoding === 'hex' ? trimmed.toLowerCase() : trimmed;
}

// Which algorithm (if any) a pasted hash came from, judged by its length -
// helps when someone pastes a checksum without saying what it is.
export function guessAlgorithm(hash) {
  const clean = hash.trim().replace(/[\s:]/g, '');
  if (!/^[0-9a-f]+$/i.test(clean)) return null;
  return ALGORITHMS.find((a) => a.bits / 4 === clean.length)?.id ?? null;
}
