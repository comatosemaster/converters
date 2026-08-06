// -----------------------------------------------------------------------
// DICE ROLLING LOGIC - no React, no DOM, no animation timing (that lives
// in DiceRoller.jsx). Pure functions only, so this file can be read (or
// reused) completely independently of the UI.
//
// Uses Math.random() rather than crypto.getRandomValues() (unlike
// Password Generator's random source) - a die roll has no security
// requirement, so the simpler API is the right call here.
// -----------------------------------------------------------------------

export const DICE_TYPES = [
  { id: 'd4', label: 'D4', sides: 4 },
  { id: 'd6', label: 'D6', sides: 6 },
  { id: 'd8', label: 'D8', sides: 8 },
  { id: 'd10', label: 'D10', sides: 10 },
  { id: 'd12', label: 'D12', sides: 12 },
  { id: 'd20', label: 'D20', sides: 20 },
  { id: 'd100', label: 'D100', sides: 100 },
];

export const DEFAULT_DICE_TYPE_ID = 'd6';
export const DEFAULT_DICE_COUNT = '1';
export const MIN_DICE = 1;
export const MAX_DICE = 20;
export const MAX_HISTORY = 20;
export const ROLL_ANIMATION_MS = 800;

export function getDiceTypeById(id) {
  return DICE_TYPES.find((type) => type.id === id) ?? DICE_TYPES[1];
}

// Checks the dice count is usable before rolling is attempted. Returns
// `{ ok: true, value }` or `{ ok: false, error }` - never throws, so the
// UI never needs a try/catch of its own.
export function validateDiceCount(input) {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: '' }; // empty isn't an "error" to display

  const value = Number(trimmed);
  if (!Number.isInteger(value)) {
    return { ok: false, error: 'Enter a whole number.' };
  }
  if (value < MIN_DICE || value > MAX_DICE) {
    return { ok: false, error: `Enter a number of dice between ${MIN_DICE} and ${MAX_DICE}.` };
  }
  return { ok: true, value };
}

export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(sides, count) {
  return Array.from({ length: count }, () => rollDie(sides));
}

export function calculateTotal(results) {
  return results.reduce((sum, value) => sum + value, 0);
}

export function calculateAverage(results) {
  return results.length === 0 ? 0 : calculateTotal(results) / results.length;
}

// Trims a trailing ".00"/"0" the same way currencyUtils.js's formatRate()
// does, so a clean average like 3 shows as "3," not "3.00."
export function formatAverage(value) {
  return value.toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

// Prepends a new roll and caps the list at MAX_HISTORY - the same
// "newest first, capped" shape used by every other tool's recent-history
// list on this site (see unitUtils.js, tipUtils.js, currencyUtils.js).
export function addRollToHistory(history, entry) {
  return [entry, ...history].slice(0, MAX_HISTORY);
}
