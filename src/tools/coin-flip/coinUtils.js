// -----------------------------------------------------------------------
// COIN FLIP LOGIC - no React, no DOM, no animation timing (that lives in
// CoinFlip.jsx). Pure functions only, so this file can be read (or
// reused) completely independently of the UI.
//
// Uses Math.random() rather than crypto.getRandomValues() - same
// reasoning as diceUtils.js: no security requirement here, so the
// simpler API is the right call.
// -----------------------------------------------------------------------

export const DEFAULT_COIN_COUNT = '1';
export const MIN_COINS = 1;
export const MAX_COINS = 100;
export const MAX_HISTORY = 20;
export const FLIP_ANIMATION_MS = 1000;

// Checks the coin count is usable before flipping is attempted. Returns
// `{ ok: true, value }` or `{ ok: false, error }` - never throws, so the
// UI never needs a try/catch of its own.
export function validateCoinCount(input) {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: '' }; // empty isn't an "error" to display

  const value = Number(trimmed);
  if (!Number.isInteger(value)) {
    return { ok: false, error: 'Enter a whole number.' };
  }
  if (value < MIN_COINS || value > MAX_COINS) {
    return { ok: false, error: `Enter a number of coins between ${MIN_COINS} and ${MAX_COINS}.` };
  }
  return { ok: true, value };
}

export function flipCoin() {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

export function flipCoins(count) {
  return Array.from({ length: count }, flipCoin);
}

export function countHeads(results) {
  return results.filter((result) => result === 'heads').length;
}

export function countTails(results) {
  return results.length - countHeads(results);
}

export function calculateHeadsPercentage(results) {
  return results.length === 0 ? 0 : (countHeads(results) / results.length) * 100;
}

// Trims a trailing ".0" the same way diceUtils.js's formatAverage() does,
// so an even split like 50% shows as "50%," not "50.0%."
export function formatPercentage(value) {
  return `${value.toFixed(1).replace(/\.0$/, '')}%`;
}

// Prepends a new flip and caps the list at MAX_HISTORY - the same
// "newest first, capped" shape used by every other tool's recent-history
// list on this site.
export function addFlipToHistory(history, entry) {
  return [entry, ...history].slice(0, MAX_HISTORY);
}
