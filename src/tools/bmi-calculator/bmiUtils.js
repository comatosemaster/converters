// -----------------------------------------------------------------------
// BMI LOGIC - no React, no DOM. Pure functions only, so this file can be
// read (or reused) completely independently of the UI in
// BmiCalculator.jsx.
//
// Imperial-to-metric conversion (inches -> cm, pounds -> kg) reuses
// convertValue() from unit-converter/unitUtils.js rather than
// re-declaring the same conversion factors here - every calculation
// below then works in plain metric (cm/kg) regardless of which unit
// system the visitor is typing in.
// -----------------------------------------------------------------------

import { convertValue } from '../unit-converter/unitUtils.js';

export const UNIT_SYSTEMS = [
  { id: 'metric', label: 'Metric' },
  { id: 'imperial', label: 'Imperial' },
];

export const DEFAULT_UNIT_SYSTEM = 'metric';

// Generous but real bounds - wide enough to never reject a genuine human
// measurement, narrow enough to catch an obvious typo (a height of
// "1700" cm, a weight of "-5" kg) with a specific, friendly message
// instead of a nonsense BMI.
const MIN_HEIGHT_CM = 50;
const MAX_HEIGHT_CM = 272; // taller than any reliably recorded adult
const MIN_WEIGHT_KG = 1;
const MAX_WEIGHT_KG = 500;

// --- BMI categories (WHO standard) -------------------------------------------------

// `max` is exclusive - a BMI of exactly 18.5 is already "Normal weight",
// not "Underweight", matching the WHO's own published thresholds.
const BMI_CATEGORIES = [
  { id: 'underweight', label: 'Underweight', max: 18.5 },
  { id: 'normal', label: 'Normal weight', max: 25 },
  { id: 'overweight', label: 'Overweight', max: 30 },
  { id: 'obese-1', label: 'Obesity Class I', max: 35 },
  { id: 'obese-2', label: 'Obesity Class II', max: 40 },
  { id: 'obese-3', label: 'Obesity Class III', max: Infinity },
];

export function getBMICategory(bmi) {
  return BMI_CATEGORIES.find((category) => bmi < category.max) ?? BMI_CATEGORIES[BMI_CATEGORIES.length - 1];
}

// --- Core calculations ---------------------------------------------------------------

// The standard BMI formula: weight(kg) / height(m)². Both parameters are
// always plain metric here - imperial inputs are converted to cm/kg
// BEFORE this is ever called (see the validate* functions below), so
// this one formula is the only place the actual math lives.
export function calculateBMI(heightCm, weightKg) {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

// The weight range that would put this height's BMI in the WHO "Normal
// weight" band (18.5-24.9) - returned already converted to whichever
// unit the visitor is currently displaying.
export function calculateHealthyWeightRange(heightCm, unitSystem) {
  const heightM = heightCm / 100;
  const minKg = 18.5 * heightM * heightM;
  const maxKg = 24.9 * heightM * heightM;
  if (unitSystem === 'imperial') {
    return {
      min: convertValue('weight', minKg, 'kilogram', 'pound'),
      max: convertValue('weight', maxKg, 'kilogram', 'pound'),
    };
  }
  return { min: minKg, max: maxKg };
}

// --- Validation -----------------------------------------------------------------------

// Both validate*Inputs functions below return `{ ok: true, heightCm,
// weightKg }` (already normalized to metric) or `{ ok: false, error }` -
// never throw, so the UI never needs a try/catch of its own. Matches the
// validate*() vocabulary used throughout this site.

function validateMetricInputs(heightCmText, weightKgText) {
  const heightTrimmed = heightCmText.trim();
  const weightTrimmed = weightKgText.trim();
  if (!heightTrimmed && !weightTrimmed) return { ok: false, error: '' }; // pristine, not an error
  if (!heightTrimmed) return { ok: false, error: 'Enter your height.' };
  if (!weightTrimmed) return { ok: false, error: 'Enter your weight.' };

  const heightCm = Number(heightTrimmed);
  const weightKg = Number(weightTrimmed);
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) {
    return { ok: false, error: 'Height and weight must be valid numbers.' };
  }
  if (heightCm <= 0 || weightKg <= 0) {
    return { ok: false, error: 'Height and weight must be greater than zero.' };
  }
  if (heightCm < MIN_HEIGHT_CM || heightCm > MAX_HEIGHT_CM) {
    return { ok: false, error: `Enter a realistic height, between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.` };
  }
  if (weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) {
    return { ok: false, error: `Enter a realistic weight, between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.` };
  }
  return { ok: true, heightCm, weightKg };
}

function validateImperialInputs(heightFtText, heightInText, weightLbText) {
  const feetTrimmed = heightFtText.trim();
  const inchesTrimmed = heightInText.trim();
  const weightTrimmed = weightLbText.trim();
  if (!feetTrimmed && !inchesTrimmed && !weightTrimmed) return { ok: false, error: '' };
  if (!feetTrimmed && !inchesTrimmed) return { ok: false, error: 'Enter your height.' };
  if (!weightTrimmed) return { ok: false, error: 'Enter your weight.' };

  // An empty feet or inches field (but not both) is treated as 0 - e.g.
  // someone entering "0 ft 8 in" for a baby's height, or just "5 ft"
  // with inches left blank.
  const feet = feetTrimmed === '' ? 0 : Number(feetTrimmed);
  const inches = inchesTrimmed === '' ? 0 : Number(inchesTrimmed);
  const weightLb = Number(weightTrimmed);

  if (!Number.isFinite(feet) || !Number.isFinite(inches) || !Number.isFinite(weightLb)) {
    return { ok: false, error: 'Height and weight must be valid numbers.' };
  }
  if (feet < 0 || inches < 0) {
    return { ok: false, error: 'Height cannot be negative.' };
  }
  if (weightLb <= 0) {
    return { ok: false, error: 'Weight must be greater than zero.' };
  }
  if (inches >= 12) {
    return { ok: false, error: 'Inches must be less than 12 - use the feet field for whole feet.' };
  }

  const heightCm = convertValue('length', feet * 12 + inches, 'inch', 'centimeter');
  if (heightCm < MIN_HEIGHT_CM || heightCm > MAX_HEIGHT_CM) {
    return { ok: false, error: 'Enter a realistic height.' };
  }
  const weightKg = convertValue('weight', weightLb, 'pound', 'kilogram');
  if (weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) {
    return { ok: false, error: 'Enter a realistic weight.' };
  }

  return { ok: true, heightCm, weightKg };
}

// The single entry point BmiCalculator.jsx actually calls - picks the
// right validator for the current unit system so the component doesn't
// need its own if/else for that.
export function validateBmiInputs(unitSystem, fields) {
  if (unitSystem === 'imperial') {
    return validateImperialInputs(fields.heightFt, fields.heightIn, fields.weightLb);
  }
  return validateMetricInputs(fields.heightCm, fields.weightKg);
}

// --- BMI scale (for the horizontal indicator bar) --------------------------------------

// The visual scale deliberately covers a narrower, more human range than
// the full space of possible BMI values - a scale honest enough to show
// 60 or 15 at the same width as 18-30 would make the "Normal" band a
// sliver too thin to read. Anything outside this range still shows a
// correct BMI number, just clamped to the bar's edge.
export const SCALE_MIN_BMI = 15;
export const SCALE_MAX_BMI = 40;

export const SCALE_SECTIONS = [
  { id: 'underweight', label: 'Underweight', from: SCALE_MIN_BMI, to: 18.5 },
  { id: 'normal', label: 'Normal', from: 18.5, to: 25 },
  { id: 'overweight', label: 'Overweight', from: 25, to: 30 },
  { id: 'obese', label: 'Obese', from: 30, to: SCALE_MAX_BMI },
];

// Where the live indicator sits along the bar, as a 0-100 percentage -
// the suggested "updateScaleIndicator()" utility, shaped as a pure
// calculation rather than an imperative DOM update since the component
// re-renders declaratively from this value instead.
export function getScaleIndicatorPercent(bmi) {
  const clamped = Math.max(SCALE_MIN_BMI, Math.min(SCALE_MAX_BMI, bmi));
  return ((clamped - SCALE_MIN_BMI) / (SCALE_MAX_BMI - SCALE_MIN_BMI)) * 100;
}

// --- Formatting -------------------------------------------------------------------------

export function formatBMI(bmi) {
  return bmi.toFixed(1);
}

export function formatWeightValue(value) {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
}
