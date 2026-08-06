// -----------------------------------------------------------------------
// UNIT CONVERSION ENGINE - no React, no DOM. Kept separate from
// UnitConverter.jsx so the conversion math, validation, and formatting
// can be read (or reused) independently of the UI.
//
// Categories are configuration objects, not a switch statement - adding
// a 4th category later (e.g. Volume) means adding one entry to
// CATEGORIES below, nothing in UnitConverter.jsx has to change, since it
// already just reads whichever category is selected from this list.
// -----------------------------------------------------------------------

// --- Category configuration ----------------------------------------------------
//
// Length and Weight are LINEAR: every unit stores a `toBase` factor -
// "how many base units is 1 of this unit worth" - so converting is just
// value * fromUnit.toBase / toUnit.toBase. Temperature has no `toBase`
// factor at all, since Celsius/Fahrenheit/Kelvin relate to each other by
// an offset as well as a scale (affine, not linear) - see
// convertTemperature() further down for its own dedicated math.

export const CATEGORIES = [
  {
    id: 'length',
    name: 'Length',
    defaultFrom: 'meter',
    defaultTo: 'foot',
    units: [
      { id: 'millimeter', name: 'Millimeter', symbol: 'mm', toBase: 0.001 },
      { id: 'centimeter', name: 'Centimeter', symbol: 'cm', toBase: 0.01 },
      { id: 'meter', name: 'Meter', symbol: 'm', toBase: 1 },
      { id: 'kilometer', name: 'Kilometer', symbol: 'km', toBase: 1000 },
      { id: 'inch', name: 'Inch', symbol: 'in', toBase: 0.0254 },
      { id: 'foot', name: 'Foot', symbol: 'ft', toBase: 0.3048 },
      { id: 'yard', name: 'Yard', symbol: 'yd', toBase: 0.9144 },
      { id: 'mile', name: 'Mile', symbol: 'mi', toBase: 1609.344 },
      { id: 'nautical-mile', name: 'Nautical Mile', symbol: 'nmi', toBase: 1852 },
    ],
  },
  {
    id: 'weight',
    name: 'Weight / Mass',
    defaultFrom: 'kilogram',
    defaultTo: 'pound',
    units: [
      { id: 'milligram', name: 'Milligram', symbol: 'mg', toBase: 0.001 },
      { id: 'gram', name: 'Gram', symbol: 'g', toBase: 1 },
      { id: 'kilogram', name: 'Kilogram', symbol: 'kg', toBase: 1000 },
      { id: 'metric-ton', name: 'Metric Ton', symbol: 't', toBase: 1_000_000 },
      { id: 'ounce', name: 'Ounce', symbol: 'oz', toBase: 28.349523125 },
      { id: 'pound', name: 'Pound', symbol: 'lb', toBase: 453.59237 },
      { id: 'stone', name: 'Stone', symbol: 'st', toBase: 6350.29318 },
    ],
  },
  {
    id: 'temperature',
    name: 'Temperature',
    defaultFrom: 'celsius',
    defaultTo: 'fahrenheit',
    units: [
      { id: 'celsius', name: 'Celsius', symbol: '°C' },
      { id: 'fahrenheit', name: 'Fahrenheit', symbol: '°F' },
      { id: 'kelvin', name: 'Kelvin', symbol: 'K' },
    ],
  },
];

export function getCategoryById(categoryId) {
  return CATEGORIES.find((category) => category.id === categoryId);
}

export function getUnitById(categoryId, unitId) {
  return getCategoryById(categoryId)?.units.find((unit) => unit.id === unitId);
}

// --- Linear conversions (length, weight) ----------------------------------------

function convertLinear(categoryId, value, fromId, toId) {
  const category = getCategoryById(categoryId);
  const fromUnit = category.units.find((unit) => unit.id === fromId);
  const toUnit = category.units.find((unit) => unit.id === toId);
  // Going through the shared base unit (rather than a direct unit-to-unit
  // factor table) is what makes adding a new unit a one-line change -
  // it only ever needs its own toBase value, never a factor against
  // every other unit in the category.
  return (value * fromUnit.toBase) / toUnit.toBase;
}

export function convertLength(value, fromId, toId) {
  return convertLinear('length', value, fromId, toId);
}

export function convertWeight(value, fromId, toId) {
  return convertLinear('weight', value, fromId, toId);
}

// --- Temperature conversion (affine, not linear) ---------------------------------
//
// Unlike length/weight, temperature scales don't share a "0 means
// nothing" origin (0°C is not the same physical temperature as 0°F), so
// a single multiplicative factor can't describe the relationship - each
// pair needs its own formula. Converting always goes via Celsius as the
// common middle step, so adding a 4th temperature scale later only needs
// a toCelsius/fromCelsius pair for that one new unit.

function toCelsius(value, fromId) {
  if (fromId === 'fahrenheit') return ((value - 32) * 5) / 9;
  if (fromId === 'kelvin') return value - 273.15;
  return value; // already celsius
}

function fromCelsius(celsius, toId) {
  if (toId === 'fahrenheit') return (celsius * 9) / 5 + 32;
  if (toId === 'kelvin') return celsius + 273.15;
  return celsius; // already celsius
}

export function convertTemperature(value, fromId, toId) {
  return fromCelsius(toCelsius(value, fromId), toId);
}

// --- The single entry point the UI calls -----------------------------------------

export function convertValue(categoryId, value, fromId, toId) {
  if (categoryId === 'temperature') return convertTemperature(value, fromId, toId);
  if (categoryId === 'weight') return convertWeight(value, fromId, toId);
  return convertLength(value, fromId, toId);
}

// --- Formatting -------------------------------------------------------------------

// "Auto" rounds to 6 decimals (enough to avoid floating-point noise like
// 32.00000000000001) and then drops trailing zeros, so a clean result
// like 100 reads as "100" rather than "100.000000". A fixed precision
// always shows exactly that many decimal places.
export function formatResult(value, precision) {
  if (!Number.isFinite(value)) return '—';
  if (precision === 'auto') {
    return Number(value.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
  }
  const digits = Number(precision);
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// --- Swapping ----------------------------------------------------------------------

export function swapUnits(fromId, toId) {
  return { from: toId, to: fromId };
}

// --- Validation ---------------------------------------------------------------------

// How cold each temperature scale can physically go - anything colder is
// not a real temperature, regardless of how the number itself parses.
const ABSOLUTE_ZERO = { celsius: -273.15, fahrenheit: -459.67, kelvin: 0 };

// Accepts plain integers/decimals and scientific notation (1.5e3, -2E-4),
// with or without a sign - deliberately closer to what Number() accepts
// than a narrow "digits and one dot" pattern, so valid scientific
// notation isn't rejected before Number() ever sees it.
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

// Never throws. `unitId` is only meaningful for temperature (it decides
// which absolute-zero floor applies); it's ignored for other categories.
export function validateInput(rawValue, categoryId, unitId) {
  const trimmed = rawValue.trim();

  if (trimmed === '') {
    return { ok: false, error: 'Enter an amount to convert.', value: null };
  }
  if (!NUMBER_PATTERN.test(trimmed)) {
    return { ok: false, error: 'Enter a valid number, like 42, 3.14, or 1.5e3.', value: null };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: "That number is too large to convert - even JavaScript's own number type gives up.", value: null };
  }

  if (categoryId === 'temperature') {
    const floor = ABSOLUTE_ZERO[unitId];
    if (floor !== undefined && value < floor) {
      const unit = getUnitById(categoryId, unitId);
      return {
        ok: false,
        error: `That's below absolute zero - the coldest possible temperature is ${floor}${unit?.symbol ?? ''}.`,
        value: null,
      };
    }
  } else if (value < 0) {
    return { ok: false, error: "Enter a positive amount - this category doesn't have negative quantities.", value: null };
  }

  return { ok: true, error: '', value };
}

// --- Formula display -----------------------------------------------------------------

const TEMPERATURE_FORMULAS = {
  'fahrenheit-celsius': '°C = (°F − 32) × 5/9',
  'kelvin-celsius': '°C = K − 273.15',
  'celsius-fahrenheit': '°F = °C × 9/5 + 32',
  'kelvin-fahrenheit': '°F = (K − 273.15) × 9/5 + 32',
  'celsius-kelvin': 'K = °C + 273.15',
  'fahrenheit-kelvin': 'K = (°F − 32) × 5/9 + 273.15',
};

// Returns a short, human-readable formula string, or null when there's
// nothing useful to show (converting a unit to itself).
export function getFormula(categoryId, fromUnit, toUnit) {
  if (!fromUnit || !toUnit || fromUnit.id === toUnit.id) return null;

  if (categoryId === 'temperature') {
    return TEMPERATURE_FORMULAS[`${fromUnit.id}-${toUnit.id}`] ?? null;
  }

  const ratio = fromUnit.toBase / toUnit.toBase;
  return `1 ${fromUnit.symbol} = ${formatResult(ratio, '6')} ${toUnit.symbol}`;
}

// --- Quick-insert shortcuts ----------------------------------------------------------

export const COMMON_CONVERSIONS = {
  length: [
    { from: 'meter', to: 'foot', label: 'Meter → Foot' },
    { from: 'kilometer', to: 'mile', label: 'Kilometer → Mile' },
    { from: 'inch', to: 'centimeter', label: 'Inch → Centimeter' },
  ],
  weight: [
    { from: 'kilogram', to: 'pound', label: 'Kilogram → Pound' },
    { from: 'pound', to: 'kilogram', label: 'Pound → Kilogram' },
    { from: 'gram', to: 'ounce', label: 'Gram → Ounce' },
  ],
  temperature: [
    { from: 'celsius', to: 'fahrenheit', label: 'Celsius → Fahrenheit' },
    { from: 'fahrenheit', to: 'celsius', label: 'Fahrenheit → Celsius' },
    { from: 'celsius', to: 'kelvin', label: 'Celsius → Kelvin' },
  ],
};

// --- Recent conversions ---------------------------------------------------------------

// Adds one entry to the front of the recent-conversions list, skipping a
// duplicate of whatever's already at the front (e.g. clicking in and out
// of the amount field twice without changing anything), and capping the
// list at `maxEntries`.
export function addRecentConversion(recentList, entry, maxEntries = 10) {
  const latest = recentList[0];
  const isDuplicate =
    latest &&
    latest.categoryId === entry.categoryId &&
    latest.amount === entry.amount &&
    latest.fromUnit === entry.fromUnit &&
    latest.toUnit === entry.toUnit &&
    latest.precision === entry.precision;
  if (isDuplicate) return recentList;
  return [entry, ...recentList].slice(0, maxEntries);
}
