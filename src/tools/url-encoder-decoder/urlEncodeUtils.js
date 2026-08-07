// -----------------------------------------------------------------------
// URL ENCODING LOGIC - no React, no DOM. Built entirely on the browser's
// native encodeURIComponent()/decodeURIComponent() - pure functions
// only, so this file can be read (or reused) completely independently
// of the UI in UrlEncoderDecoder.jsx.
// -----------------------------------------------------------------------

export const OPERATIONS = [
  { id: 'encode', label: 'Encode' },
  { id: 'decode', label: 'Decode' },
];

export const DEFAULT_OPERATION = 'encode';

// Clicking an example loads its plain-text original into the input,
// pre-set to Encode - both examples are the two given in this tool's
// own spec.
export const EXAMPLES = [
  { label: 'Hello World!', original: 'Hello World!' },
  { label: 'name=John & age=25', original: 'name=John & age=25' },
];

// encodeURIComponent() escapes every reserved/unsafe character EXCEPT
// five it deliberately leaves alone: ! ' ( ) * - leftovers from an
// older, looser URI spec. Re-escaping just those five gives full,
// strict RFC 3986 percent-encoding (e.g. "!" -> "%21"), which is what
// most people actually mean by "URL-encode this text" - this is the
// standard technique MDN itself documents for exactly this gap.
function escapeLeftoverChars(text) {
  return text.replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function encodeText(text) {
  return escapeLeftoverChars(encodeURIComponent(text));
}

// Never throws - decodeURIComponent() throws a URIError on malformed
// percent-encoding (a stray "%" not followed by two hex digits, or a
// sequence that doesn't decode to valid UTF-8), which this turns into
// a friendly, specific message instead of an uncaught exception.
export function decodeText(text) {
  try {
    return { ok: true, value: decodeURIComponent(text) };
  } catch {
    return {
      ok: false,
      error:
        'That doesn\'t look like validly percent-encoded text - check for a "%" that isn\'t followed by two hex digits, or an incomplete escape sequence.',
    };
  }
}

// The single entry point UrlEncoderDecoder.jsx calls - picks the right
// direction and normalizes both into the same `{ ok, value, error }`
// shape (encoding never fails, so it's always `ok: true`).
export function processText(text, operation) {
  if (!text.trim()) return { ok: false, value: '', error: '' }; // pristine, not an error
  if (operation === 'decode') return decodeText(text);
  return { ok: true, value: encodeText(text) };
}

// Swapping carries the current OUTPUT over as the new input and flips
// the operation, so a completed encode/decode can be immediately
// reversed - same shape as Base64Tool.jsx's handleSwap().
export function swapDirection(operation) {
  return operation === 'encode' ? 'decode' : 'encode';
}
