// -----------------------------------------------------------------------
// JWT DECODING LOGIC - no React, no DOM (aside from the browser-native
// atob()/TextDecoder used for Base64URL decoding, and Intl for relative
// time). Pure functions only, so this file can be read (or reused)
// completely independently of the UI in JwtDecoder.jsx.
//
// This ONLY decodes and inspects a token - it never attempts to verify
// the signature (that needs the issuer's secret/public key, which this
// tool never has and never asks for). See the "signature" section of
// JwtDecoder.jsx for how that's explained to the user.
//
// Pretty-printing and syntax-highlighting the decoded header/payload
// JSON are NOT reimplemented here - JwtDecoder.jsx imports formatJson()
// from json-formatter-validator/jsonUtils.js and highlightJson() from
// json-formatter-validator/jsonHighlight.js directly, the same functions
// that tool already uses.
// -----------------------------------------------------------------------

// A well-known, public, harmless example token (the same default shown
// on jwt.io) - safe to ship in source since it carries no real secret or
// personal data, just a made-up "John Doe" subject.
export const EXAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// --- Base64URL decoding ------------------------------------------------------------

// JWTs use Base64URL (RFC 4648 §5): '-' instead of '+', '_' instead of
// '/', and no padding - none of which plain atob() accepts directly, so
// both have to be normalized back to standard Base64 first. atob() then
// returns a BINARY string (one JS char per byte, not per Unicode
// character), which is why the result is re-decoded through
// TextDecoder rather than returned as-is - without that step, any
// non-ASCII character in a claim (an accented name, emoji, etc.) would
// come out corrupted.
export function decodeBase64Url(segment) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded); // throws on genuinely invalid Base64
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// --- Structural validation ----------------------------------------------------------

// Checks the token LOOKS like a JWT (three non-empty, dot-separated
// parts) before anything tries to decode it. Returns
// `{ ok: true, parts }` or `{ ok: false, error }` - never throws.
export function validateJwt(token) {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: '' }; // empty isn't an "error" to display

  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return {
      ok: false,
      error: 'A JWT must have exactly three parts separated by periods (header.payload.signature).',
    };
  }
  if (parts.some((part) => part.length === 0)) {
    return { ok: false, error: 'One or more parts of the token are empty.' };
  }
  return { ok: true, parts };
}

function decodeSegmentJson(segment, label) {
  let text;
  try {
    text = decodeBase64Url(segment);
  } catch {
    return { ok: false, error: `The ${label} isn't valid Base64URL - this doesn't look like a real JWT.` };
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: `The decoded ${label} isn't valid JSON.` };
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: `The ${label} must be a JSON object.` };
  }
  return { ok: true, value, json: text };
}

// The main entry point: validates structure, decodes both JSON segments,
// and leaves the signature as an opaque string (see the file header
// comment - it's never decoded or verified). Returns
// `{ ok: true, header, headerJson, payload, payloadJson, signature }` or
// `{ ok: false, error }` - never throws, so the UI never needs a
// try/catch of its own.
export function decodeJwt(token) {
  const validation = validateJwt(token);
  if (!validation.ok) return validation;

  const [headerSegment, payloadSegment, signatureSegment] = validation.parts;

  const header = decodeSegmentJson(headerSegment, 'header');
  if (!header.ok) return header;

  const payload = decodeSegmentJson(payloadSegment, 'payload');
  if (!payload.ok) return payload;

  return {
    ok: true,
    header: header.value,
    headerJson: header.json,
    payload: payload.value,
    payloadJson: payload.json,
    signature: signatureSegment,
  };
}

// --- Standard claims ------------------------------------------------------------------

// RFC 7519's seven registered claim names, with a friendly label and a
// one-line explanation for each - shown in the "Standard Claims" section
// whenever a decoded payload actually contains that key. `isTimestamp`
// marks the three claims defined as a NumericDate (Unix seconds), which
// get the Local/UTC/relative-time treatment below rather than being
// shown as a bare number.
export const STANDARD_CLAIMS = [
  { key: 'iss', label: 'Issuer', explanation: 'The service or application that issued the token.' },
  { key: 'sub', label: 'Subject', explanation: 'The subject of the token - typically the user or entity it represents.' },
  { key: 'aud', label: 'Audience', explanation: 'The intended audience for this token.' },
  {
    key: 'exp',
    label: 'Expiration Time',
    explanation: 'The date and time after which the token should no longer be accepted.',
    isTimestamp: true,
  },
  {
    key: 'nbf',
    label: 'Not Before',
    explanation: 'The date and time before which the token must not be accepted.',
    isTimestamp: true,
  },
  { key: 'iat', label: 'Issued At', explanation: 'The date and time when the token was issued.', isTimestamp: true },
  { key: 'jti', label: 'JWT ID', explanation: 'A unique identifier for this specific token, often used to prevent replay.' },
];

// Picks out whichever standard claims are actually present in this
// payload, in the fixed order above, each paired with its label,
// explanation, and raw value - JwtDecoder.jsx just maps over the result.
export function parseClaims(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return STANDARD_CLAIMS.filter((claim) => payload[claim.key] !== undefined).map((claim) => ({
    ...claim,
    value: payload[claim.key],
  }));
}

// --- Timestamps -------------------------------------------------------------------------

// JWT time claims are a NumericDate: whole seconds since the Unix epoch
// (RFC 7519 §2) - NOT milliseconds, which is the single most common
// mistake when hand-rolling this conversion.
export function formatTimestamp(unixSeconds) {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) return null;
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return null;

  return {
    local: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }),
    utc: date.toUTCString(),
  };
}

// Standard MDN-documented Intl.RelativeTimeFormat "divisions" pattern -
// walks progressively larger units until the duration fits in one,
// giving natural output like "in 3 hours" or "2 days ago" fully
// localized to the visitor's own browser language, with no
// hand-maintained unit table of our own.
const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_TIME_DIVISIONS = [
  { amount: 60, unit: 'seconds' },
  { amount: 60, unit: 'minutes' },
  { amount: 24, unit: 'hours' },
  { amount: 7, unit: 'days' },
  { amount: 4.34524, unit: 'weeks' },
  { amount: 12, unit: 'months' },
  { amount: Infinity, unit: 'years' },
];

export function getRelativeTime(unixSeconds, now = new Date()) {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) return '';

  let duration = unixSeconds - now.getTime() / 1000;
  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeTimeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return '';
}

// --- Token status -----------------------------------------------------------------------

// 'valid' | 'expired' | 'not-yet-valid' - a payload with no exp/nbf
// claims at all is simply always 'valid', per RFC 7519 (those claims are
// optional). Decode FAILURES are a separate case ('invalid'), handled by
// the caller before this is ever reached.
export function getTokenStatus(payload, now = new Date()) {
  const nowSeconds = now.getTime() / 1000;
  if (typeof payload.exp === 'number' && nowSeconds >= payload.exp) return 'expired';
  if (typeof payload.nbf === 'number' && nowSeconds < payload.nbf) return 'not-yet-valid';
  return 'valid';
}

export const TOKEN_STATUS_LABELS = {
  valid: 'Valid',
  expired: 'Expired',
  'not-yet-valid': 'Not Yet Valid',
  invalid: 'Invalid JWT',
};
