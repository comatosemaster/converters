// -----------------------------------------------------------------------
// PASSWORD GENERATION LOGIC - no React, no DOM (besides the Web Crypto
// API, which is available in every environment this app runs in). Pure
// functions only, so this file can be read (or reused) completely
// independently of the UI in PasswordGenerator.jsx.
// -----------------------------------------------------------------------

// Character sets used to build a password. "Similar" characters (kept in
// their own list rather than baked into the sets below) are ones that are
// easy to misread in certain fonts: 0/O, 1/l/I, etc.
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
const SIMILAR_CHARS = 'O0Il1';

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 64;
export const DEFAULT_LENGTH = 16;

// One entry per checkbox in the UI - keeping them in a list (rather than
// four separate booleans scattered through the code) is what lets both
// the character-set building below and the "at least one is on" check
// stay a simple loop instead of four repeated if-statements.
export const CHARACTER_SETS = [
  { id: 'uppercase', label: 'Uppercase letters (A-Z)', chars: UPPERCASE },
  { id: 'lowercase', label: 'Lowercase letters (a-z)', chars: LOWERCASE },
  { id: 'numbers', label: 'Numbers (0-9)', chars: NUMBERS },
  { id: 'symbols', label: 'Symbols (!@#$...)', chars: SYMBOLS },
];

export function createDefaultOptions() {
  return {
    length: DEFAULT_LENGTH,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: false,
    excludeSimilar: false,
  };
}

// Checks the options are usable before generation is attempted. Returns
// `{ ok: true }` or `{ ok: false, error }` - never throws, so the UI never
// needs a try/catch of its own.
export function validateOptions(options) {
  const anySetEnabled = CHARACTER_SETS.some((set) => options[set.id]);
  if (!anySetEnabled) {
    return { ok: false, error: 'Select at least one character type to generate a password.' };
  }

  const length = Number(options.length);
  if (!Number.isFinite(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    return { ok: false, error: `Length must be between ${MIN_LENGTH} and ${MAX_LENGTH}.` };
  }

  return { ok: true };
}

// Builds the pool of characters generation draws from, honoring
// "exclude similar characters" by stripping them out of each enabled set
// rather than the whole alphabet - so excluding similar characters from
// symbols-only, say, is a no-op instead of accidentally touching letters.
function buildCharacterPool(options) {
  return CHARACTER_SETS.filter((set) => options[set.id])
    .map((set) => (options.excludeSimilar ? stripChars(set.chars, SIMILAR_CHARS) : set.chars))
    .join('');
}

function stripChars(source, toRemove) {
  return [...source].filter((char) => !toRemove.includes(char)).join('');
}

// Picks one cryptographically random index into `max` (exclusive) using
// crypto.getRandomValues() - rather than Math.random(), which is not
// suitable for anything security-sensitive since it's not guaranteed to
// be unpredictable.
//
// Uses rejection sampling to avoid "modulo bias": naively doing
// `randomByte % max` would make lower indices very slightly more likely
// whenever 256 isn't a clean multiple of `max`. Discarding out-of-range
// bytes and redrawing keeps every index equally likely.
function randomIndex(max) {
  const range = 256 - (256 % max);
  const bytes = new Uint8Array(1);
  let value;
  do {
    crypto.getRandomValues(bytes);
    value = bytes[0];
  } while (value >= range);
  return value % max;
}

function randomChar(pool) {
  return pool[randomIndex(pool.length)];
}

// Fisher-Yates shuffle, also using crypto.getRandomValues() - used to mix
// the "guaranteed one of each enabled type" characters in below rather
// than leaving them clustered at the front of the password.
function shuffle(chars) {
  const result = [...chars];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Generates a password from the given options. Assumes `validateOptions`
// has already passed - callers (the UI) are expected to check that first
// and show a friendly message instead of calling this.
export function generatePassword(options) {
  const pool = buildCharacterPool(options);
  const length = Number(options.length);

  // Guarantees at least one character from every enabled set (so e.g.
  // "include symbols" can't randomly produce a symbol-free password),
  // then fills the rest of the length from the combined pool and shuffles
  // the whole thing so the guaranteed characters aren't always up front.
  const enabledSets = CHARACTER_SETS.filter((set) => options[set.id]).map((set) =>
    options.excludeSimilar ? stripChars(set.chars, SIMILAR_CHARS) : set.chars,
  );
  const guaranteed = enabledSets.map((chars) => randomChar(chars));
  const remainingCount = Math.max(0, length - guaranteed.length);
  const remaining = Array.from({ length: remainingCount }, () => randomChar(pool));

  return shuffle([...guaranteed, ...remaining]).slice(0, length).join('');
}

// --- Strength estimation --------------------------------------------------------

// Looks at which character classes actually APPEAR in the password,
// rather than trusting the current options - if the user generates a
// password with symbols on, then unchecks symbols WITHOUT clicking
// Regenerate, the on-screen password still contains a symbol, and the
// strength readout should keep reflecting that, not silently disagree
// with what's visibly sitting in the preview box.
function detectPoolSize(password) {
  let size = 0;
  if (/[A-Z]/.test(password)) size += UPPERCASE.length;
  if (/[a-z]/.test(password)) size += LOWERCASE.length;
  if (/[0-9]/.test(password)) size += NUMBERS.length;
  if (/[^A-Za-z0-9]/.test(password)) size += SYMBOLS.length;
  return size;
}

// A simple, transparent strength heuristic based on entropy (bits): the
// detected character pool size raised to the power of the length,
// expressed in bits as length * log2(poolSize). This mirrors how the pool
// a real attacker would have to brute-force grows with each character
// type present, without pulling in a full password-strength library for
// what's a generator, not an auditor of arbitrary user-typed passwords.
export function estimateStrength(password) {
  if (!password) return { label: 'Weak', score: 0, bits: 0 };

  const poolSize = detectPoolSize(password);
  const bits = poolSize > 1 ? password.length * Math.log2(poolSize) : 0;

  // Thresholds roughly follow common guidance: under ~50 bits is
  // crackable with consumer hardware in a practical timeframe, ~50-80 is
  // solid for most personal accounts, and 80+ is comfortably strong.
  if (bits < 50) return { label: 'Weak', score: 1, bits };
  if (bits < 80) return { label: 'Medium', score: 2, bits };
  return { label: 'Strong', score: 3, bits };
}
