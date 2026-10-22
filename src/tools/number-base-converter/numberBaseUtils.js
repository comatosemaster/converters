// -----------------------------------------------------------------------
// NUMBER BASE CONVERSION - no React, no DOM. Everything is done with
// BigInt, so numbers of any size convert exactly; plain JavaScript numbers
// silently lose digits past 2^53 (9,007,199,254,740,991), which is exactly
// where 64-bit IDs and hashes live.
// -----------------------------------------------------------------------

export const BASES = [
  { id: 'bin', base: 2, label: 'Binary', prefix: '0b', group: 4 },
  { id: 'oct', base: 8, label: 'Octal', prefix: '0o', group: 3 },
  { id: 'dec', base: 10, label: 'Decimal', prefix: '', group: 3 },
  { id: 'hex', base: 16, label: 'Hexadecimal', prefix: '0x', group: 2 },
];

export const BIT_WIDTHS = [8, 16, 32, 64, 128];

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

// The prefixes programmers write, mapped to their base. A typed prefix
// only counts when it matches the field it's typed into (or the custom
// field), so "0b1" in the hex field stays the hex number 0xB1.
const PREFIXES = { '0x': 16, '0o': 8, '0b': 2 };

/**
 * Text -> { ok, value: BigInt } or { ok: false, error }.
 * Accepts a leading minus, the matching 0x/0o/0b prefix, and spaces,
 * underscores or commas used as digit separators.
 */
export function parseInBase(text, base) {
  let value = text.trim().toLowerCase();
  if (!value) return { ok: false, error: '' };

  let negative = false;
  if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1).trim();
  }
  const prefix = value.slice(0, 2);
  if (PREFIXES[prefix] === base) value = value.slice(2);
  // Separators people use to make long numbers readable.
  value = value.replace(base === 10 ? /[\s_,']/g : /[\s_']/g, '');
  if (!value) return { ok: false, error: 'Enter some digits.' };

  const allowed = DIGITS.slice(0, base);
  for (const char of value) {
    if (!allowed.includes(char)) {
      const examples = base <= 10 ? `0-${base - 1}` : `0-9 and a-${DIGITS[base - 1]}`;
      return { ok: false, error: `"${char}" isn't a base-${base} digit (use ${examples}).` };
    }
  }

  // BigInt only parses bases 2, 8, 10 and 16 directly, so other bases are
  // built up digit by digit.
  let result = 0n;
  const bigBase = BigInt(base);
  for (const char of value) result = result * bigBase + BigInt(allowed.indexOf(char));
  return { ok: true, value: negative ? -result : result };
}

/** BigInt -> digits in `base` (2-36), with a leading "-" for negatives. */
export function formatInBase(value, base, { uppercase = false } = {}) {
  const text = (value < 0n ? -value : value).toString(base);
  const digits = uppercase ? text.toUpperCase() : text;
  return value < 0n ? `-${digits}` : digits;
}

/** "11010110" -> "1101 0110": groups from the right, like a calculator. */
export function groupDigits(text, size, separator = ' ') {
  if (!size) return text;
  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  const groups = [];
  for (let end = digits.length; end > 0; end -= size) groups.unshift(digits.slice(Math.max(0, end - size), end));
  return (negative ? '-' : '') + groups.join(separator);
}

/** Smallest standard width that holds `value` as a signed or unsigned integer. */
export function fittingWidth(value) {
  return BIT_WIDTHS.find((width) => value >= -(1n << BigInt(width - 1)) && value < 1n << BigInt(width)) ?? null;
}

/**
 * The bit pattern of `value` in a fixed width, using two's complement for
 * negatives - how a computer actually stores the number. Also returns the
 * same bits read as unsigned and as signed, which is how e.g. -1 and
 * 4294967295 turn out to be the same 32 bits.
 * Returns null when the value doesn't fit.
 */
export function bitPattern(value, width) {
  const bigWidth = BigInt(width);
  const min = -(1n << (bigWidth - 1n));
  const maxUnsigned = (1n << bigWidth) - 1n;
  if (value < min || value > maxUnsigned) return null;
  const unsigned = value < 0n ? (1n << bigWidth) + value : value;
  const signed = unsigned >= 1n << (bigWidth - 1n) ? unsigned - (1n << bigWidth) : unsigned;
  return {
    bits: unsigned.toString(2).padStart(width, '0'),
    unsigned,
    signed,
  };
}

export function bitLength(value) {
  const magnitude = value < 0n ? -value : value;
  return magnitude === 0n ? 1 : magnitude.toString(2).length;
}
