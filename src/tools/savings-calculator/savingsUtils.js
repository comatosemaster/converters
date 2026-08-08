// -----------------------------------------------------------------------
// SAVINGS GROWTH LOGIC - no React, no DOM. Pure functions only, so this
// file can be read (or reused) completely independently of the UI in
// SavingsCalculator.jsx.
//
// The chart itself reuses buildChartGeometry() from
// currency-converter/currencyUtils.js rather than a new charting
// mechanism - it already turns an array of { value } points into SVG path
// data, which is exactly what a balance-over-time line needs.
// -----------------------------------------------------------------------

// Generous but real bounds - wide enough to never reject a genuine
// scenario, narrow enough to catch an obvious typo (a 3-digit interest
// rate, a million-year term) with a specific, friendly message.
const MAX_AMOUNT = 100_000_000;
const MAX_RATE_PERCENT = 100;
const MIN_RATE_PERCENT = -20; // savings CAN lose value in real terms; a wildly negative rate is still rejected below
const MAX_YEARS = 100;

export const CONTRIBUTION_FREQUENCIES = [
  { id: 'monthly', label: 'Monthly', paymentsPerYear: 12 },
  { id: 'yearly', label: 'Yearly', paymentsPerYear: 1 },
];

// --- Validation -----------------------------------------------------------

// Returns `{ ok: true, initial, contribution, ratePercent, years,
// paymentsPerYear }` or `{ ok: false, error }` - never throws, matching
// the validate*() vocabulary used across the site's other calculators
// (see bmi-calculator/bmiUtils.js).
export function validateSavingsInputs({ initialText, contributionText, rateText, yearsText, frequencyId }) {
  const initialTrimmed = initialText.trim();
  const contributionTrimmed = contributionText.trim();
  const rateTrimmed = rateText.trim();
  const yearsTrimmed = yearsText.trim();

  if (!initialTrimmed && !contributionTrimmed && !rateTrimmed && !yearsTrimmed) {
    return { ok: false, error: '' }; // pristine, not an error yet
  }
  if (!initialTrimmed) return { ok: false, error: 'Enter your initial savings (0 if starting from nothing).' };
  if (!contributionTrimmed) return { ok: false, error: 'Enter your contribution amount (0 for none).' };
  if (!rateTrimmed) return { ok: false, error: 'Enter an annual interest rate.' };
  if (!yearsTrimmed) return { ok: false, error: 'Enter a savings period in years.' };

  const initial = Number(initialTrimmed);
  const contribution = Number(contributionTrimmed);
  const ratePercent = Number(rateTrimmed);
  const years = Number(yearsTrimmed);

  if (![initial, contribution, ratePercent, years].every(Number.isFinite)) {
    return { ok: false, error: 'All fields must be valid numbers.' };
  }
  if (initial < 0 || contribution < 0) {
    return { ok: false, error: 'Initial savings and contributions cannot be negative.' };
  }
  if (initial > MAX_AMOUNT || contribution > MAX_AMOUNT) {
    return { ok: false, error: `Enter a realistic amount, under ${MAX_AMOUNT.toLocaleString()}.` };
  }
  if (ratePercent < MIN_RATE_PERCENT || ratePercent > MAX_RATE_PERCENT) {
    return { ok: false, error: `Enter an interest rate between ${MIN_RATE_PERCENT}% and ${MAX_RATE_PERCENT}%.` };
  }
  if (years <= 0 || years > MAX_YEARS) {
    return { ok: false, error: `Enter a savings period between 1 and ${MAX_YEARS} years.` };
  }

  const frequency = CONTRIBUTION_FREQUENCIES.find((option) => option.id === frequencyId) ?? CONTRIBUTION_FREQUENCIES[0];

  return { ok: true, initial, contribution, ratePercent, years, paymentsPerYear: frequency.paymentsPerYear };
}

// --- Core calculation -------------------------------------------------------

// Compound interest with regular contributions, computed month by month
// regardless of contribution frequency (a yearly contribution is just a
// contribution applied in one specific month out of twelve) - this is
// what keeps the math correct without needing a separate formula per
// frequency, and what lets the chart sample a smooth balance every year.
//
// Interest compounds monthly on whatever the balance is at the start of
// that month, then that month's contribution (if one falls in it) is
// added - contributions from this point on start earning interest
// starting next month, not retroactively.
function buildMonthlySchedule(initial, contribution, ratePercent, years, paymentsPerYear) {
  const totalMonths = Math.round(years * 12);
  const monthlyRate = ratePercent / 100 / 12;
  // Which calendar months (1-12) a contribution lands in, evenly spaced -
  // monthly means every month; yearly means just month 12 of each year.
  const contributionMonths = paymentsPerYear === 12 ? null : 12 / paymentsPerYear;

  let balance = initial;
  let totalContributed = initial;
  const points = [{ month: 0, balance, contributed: totalContributed }];

  for (let month = 1; month <= totalMonths; month++) {
    balance *= 1 + monthlyRate;

    const isContributionMonth = contributionMonths === null || month % contributionMonths === 0;
    if (isContributionMonth) {
      balance += contribution;
      totalContributed += contribution;
    }

    points.push({ month, balance, contributed: totalContributed });
  }

  return points;
}

/**
 * The full result set SavingsCalculator.jsx displays, given already-
 * validated inputs.
 */
export function calculateSavings({ initial, contribution, ratePercent, years, paymentsPerYear }) {
  const schedule = buildMonthlySchedule(initial, contribution, ratePercent, years, paymentsPerYear);
  const final = schedule[schedule.length - 1];

  // One point per year (plus year 0) for the chart - a monthly-resolution
  // line would be visually indistinguishable at typical chart widths and
  // is unnecessary detail for something meant to be "simple and readable".
  const yearlyPoints = [];
  for (let year = 0; year <= years; year++) {
    const monthIndex = Math.min(Math.round(year * 12), schedule.length - 1);
    yearlyPoints.push({ year, value: schedule[monthIndex].balance });
  }

  return {
    finalBalance: final.balance,
    totalContributions: final.contributed,
    totalInterest: final.balance - final.contributed,
    chartPoints: yearlyPoints,
  };
}

// --- Formatting -------------------------------------------------------------

export function formatCurrency(value) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
