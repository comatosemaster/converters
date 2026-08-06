// -----------------------------------------------------------------------
// RANDOM NUMBER GENERATION LOGIC - no React, no DOM, no animation timing
// (that lives in RandomNumberGenerator.jsx). Pure functions only, so this
// file can be read (or reused) completely independently of the UI.
//
// Uses Math.random() rather than crypto.getRandomValues() - same
// reasoning as diceUtils.js/coinUtils.js: no security requirement here.
// -----------------------------------------------------------------------

export const DEFAULT_MIN = '1';
export const DEFAULT_MAX = '100';
export const DEFAULT_QUANTITY = '1';
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 100;
export const MAX_HISTORY = 20;
export const GENERATE_ANIMATION_MS = 900;

export function createDefaultOptions() {
  return { allowDuplicates: true, integersOnly: true, sortAscending: false, sortDescending: false };
}

// Checks min/max/quantity are all usable together before generation is
// attempted - including the one combination that's mathematically
// impossible (asking for more unique whole numbers than the range
// actually contains). Returns `{ ok: true, values }` or
// `{ ok: false, error }` - never throws, so the UI never needs a
// try/catch of its own.
export function validateRange(minInput, maxInput, quantityInput, options) {
  const minTrimmed = minInput.trim();
  const maxTrimmed = maxInput.trim();
  const quantityTrimmed = quantityInput.trim();

  if (!minTrimmed && !maxTrimmed && !quantityTrimmed) return { ok: false, error: '' }; // pristine, not an error
  if (!minTrimmed) return { ok: false, error: 'Enter a minimum value.' };
  if (!maxTrimmed) return { ok: false, error: 'Enter a maximum value.' };
  if (!quantityTrimmed) return { ok: false, error: 'Enter a quantity.' };

  const min = Number(minTrimmed);
  const max = Number(maxTrimmed);
  const quantity = Number(quantityTrimmed);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { ok: false, error: 'Minimum and maximum must be valid numbers.' };
  }
  if (options.integersOnly && (!Number.isInteger(min) || !Number.isInteger(max))) {
    return { ok: false, error: 'Minimum and maximum must be whole numbers when "Integers only" is enabled.' };
  }
  if (min > max) {
    return { ok: false, error: 'Minimum must be less than or equal to maximum.' };
  }
  if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    return { ok: false, error: `Enter a quantity between ${MIN_QUANTITY} and ${MAX_QUANTITY}.` };
  }

  if (options.integersOnly && !options.allowDuplicates) {
    const rangeSize = Math.floor(max) - Math.ceil(min) + 1;
    if (quantity > rangeSize) {
      return {
        ok: false,
        error: `Only ${rangeSize} unique whole number${rangeSize === 1 ? '' : 's'} available in this range - lower the quantity, widen the range, or allow duplicates.`,
      };
    }
  }

  return { ok: true, values: { min, max, quantity } };
}

function randomInt(low, high) {
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Generates `quantity` numbers in [min, max]. For "integers only, no
// duplicates" this samples WITHOUT replacement (shuffling the whole
// integer range and taking the first `quantity`) rather than repeatedly
// rerolling and rejecting collisions - that shuffle-based approach can't
// degrade into a slow retry loop even when the requested quantity is
// close to the full range size. Continuous (non-integer) ranges skip the
// "unique" bookkeeping entirely: two independent floats landing on the
// exact same value is astronomically unlikely for any real min/max
// range, so treating them as always-effectively-unique is both simpler
// and correct in every practical case.
export function generateNumbers({ min, max, quantity, integersOnly, allowDuplicates }) {
  if (integersOnly) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    if (!allowDuplicates) {
      const pool = [];
      for (let value = low; value <= high; value++) pool.push(value);
      return shuffle(pool).slice(0, quantity);
    }
    return Array.from({ length: quantity }, () => randomInt(low, high));
  }
  return Array.from({ length: quantity }, () => randomFloat(min, max));
}

export function sortNumbers(numbers, sortAscending, sortDescending) {
  if (sortAscending) return [...numbers].sort((a, b) => a - b);
  if (sortDescending) return [...numbers].sort((a, b) => b - a);
  return numbers;
}

export function calculateLowest(numbers) {
  return Math.min(...numbers);
}

export function calculateHighest(numbers) {
  return Math.max(...numbers);
}

// Trims a trailing ".00"/"0" the same way diceUtils.js's formatAverage()
// and currencyUtils.js's formatRate() do.
export function formatNumber(value, integersOnly) {
  if (integersOnly) return String(Math.round(value));
  return value.toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

// Prepends a new generation and caps the list at MAX_HISTORY - the same
// "newest first, capped" shape used by every other tool's recent-history
// list on this site.
export function addGenerationToHistory(history, entry) {
  return [entry, ...history].slice(0, MAX_HISTORY);
}
