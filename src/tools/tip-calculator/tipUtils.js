// -----------------------------------------------------------------------
// TIP CALCULATOR LOGIC - no React, no DOM. Kept separate from
// TipCalculator.jsx so the math, validation, and text formatting can be
// read (or reused) independently of the UI.
//
// The central idea: everything the UI needs to display or export - the
// on-screen result panel, the receipt-per-person table, "Copy Summary",
// "Copy Per-Person Breakdown", the downloadable receipt, and a recent-
// calculations entry - all read from ONE computed snapshot object built
// by calculateSnapshot() below, rather than each being calculated
// separately. That's what keeps Equal Split and Custom Split from ever
// disagreeing with each other about a total.
// -----------------------------------------------------------------------

// --- Fixed option lists ---------------------------------------------------------

export const TIP_PRESETS = [10, 15, 18, 20, 25];

export const SERVICE_PRESETS = [
  { label: 'Excellent Service', percent: 25 },
  { label: 'Great Service', percent: 20 },
  { label: 'Good Service', percent: 18 },
  { label: 'Average Service', percent: 15 },
  { label: 'Poor Service', percent: 10 },
];

export const CURRENCY_OPTIONS = [
  { id: 'usd', symbol: '$', label: 'US Dollar ($)' },
  { id: 'eur', symbol: '€', label: 'Euro (€)' },
  { id: 'gbp', symbol: '£', label: 'British Pound (£)' },
  { id: 'jpy', symbol: '¥', label: 'Japanese Yen (¥)' },
  { id: 'gel', symbol: '₾', label: 'Georgian Lari (₾)' },
  { id: 'inr', symbol: '₹', label: 'Indian Rupee (₹)' },
  { id: 'custom', symbol: '', label: 'Custom symbol' },
];

export const ROUNDING_OPTIONS = [
  { id: 'none', label: 'No rounding' },
  { id: 'tip-up', label: 'Round tip up' },
  { id: 'tip-down', label: 'Round tip down' },
  { id: 'total-up', label: 'Round final amount up' },
  { id: 'total-down', label: 'Round final amount down' },
];

export const MAX_PEOPLE = 100;

// --- Core math --------------------------------------------------------------------

export function calculateTip(billAmount, tipPercent) {
  return (billAmount * tipPercent) / 100;
}

export function calculateTotal({ billAmount, tipAmount, taxAmount, feesAmount }) {
  return billAmount + tipAmount + taxAmount + feesAmount;
}

// Rounds to the nearest cent in the given direction. `none` is handled by
// callers simply not calling this at all - there's no "round to none."
export function roundAmount(value, direction) {
  if (direction === 'up') return Math.ceil(value * 100) / 100;
  if (direction === 'down') return Math.floor(value * 100) / 100;
  return value;
}

function applyTipRounding(tipAmount, roundingMode) {
  if (roundingMode === 'tip-up') return roundAmount(tipAmount, 'up');
  if (roundingMode === 'tip-down') return roundAmount(tipAmount, 'down');
  return tipAmount;
}

// Applied to the grand total AND to every individual person's final
// amount - splitting $100 three ways at $33.33 each really does lose a
// cent, and rounding each share up/down (accepting the resulting total
// won't exactly match to the last cent) is the standard, expected way
// bill-splitting tools handle that instead of leaving an un-payable
// fraction of a cent.
function applyTotalRounding(total, roundingMode) {
  if (roundingMode === 'total-up') return roundAmount(total, 'up');
  if (roundingMode === 'total-down') return roundAmount(total, 'down');
  return total;
}

// --- Equal split --------------------------------------------------------------------

export function splitBillEqually({ billAmount, tipAmount, taxAmount, feesAmount, peopleCount, roundingMode }) {
  const billShare = billAmount / peopleCount;
  const tipShare = tipAmount / peopleCount;
  const taxShare = taxAmount / peopleCount;
  const feesShare = feesAmount / peopleCount;
  const total = applyTotalRounding(billShare + tipShare + taxShare + feesShare, roundingMode);

  return Array.from({ length: peopleCount }, (_, index) => ({
    id: `person-${index + 1}`,
    name: `Person ${index + 1}`,
    subtotal: billShare,
    tipShare,
    taxShare,
    feesShare,
    total,
  }));
}

// --- Custom (proportional) split ----------------------------------------------------
//
// Each person's share of the tip/tax/fees is proportional to how much of
// the total bill THEY personally ordered - someone who ordered a $40
// steak pays a bigger slice of the tip than someone who ordered a $8
// side salad, unlike an equal split where everyone pays the same amount
// regardless of what they ordered.

export function splitBillProportionally(people, { tipAmount, taxAmount, feesAmount, roundingMode }) {
  const assignedTotal = people.reduce((sum, person) => sum + person.subtotal, 0);

  return people.map((person) => {
    const share = assignedTotal > 0 ? person.subtotal / assignedTotal : 0;
    const tipShare = tipAmount * share;
    const taxShare = taxAmount * share;
    const feesShare = feesAmount * share;
    const total = applyTotalRounding(person.subtotal + tipShare + taxShare + feesShare, roundingMode);
    return { ...person, tipShare, taxShare, feesShare, total };
  });
}

// A small rounding tolerance (1 cent) so ordinary floating-point noise
// from typing e.g. three subtotals that sum to 39.999999999999996 isn't
// treated as a real mismatch.
const ASSIGNMENT_TOLERANCE = 0.01;

export function getAssignedTotal(people) {
  return people.reduce((sum, person) => sum + (Number(person.subtotal) || 0), 0);
}

export function validateAssignment(people, billAmount) {
  const assignedTotal = getAssignedTotal(people);
  const difference = billAmount - assignedTotal;
  return { assignedTotal, difference, isBalanced: Math.abs(difference) <= ASSIGNMENT_TOLERANCE };
}

// --- Managing the custom-split people list ------------------------------------------
//
// Small, immutable list operations - the component's Add/Remove/rename/
// edit-subtotal handlers are just `setCustomPeople((prev) => addPerson(prev))`
// one-liners built on these.

export function createPerson(index) {
  return { id: `person-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`, name: `Person ${index}`, subtotal: '' };
}

export function createInitialPeople(count = 2) {
  return Array.from({ length: count }, (_, i) => createPerson(i + 1));
}

export function addPerson(people) {
  return [...people, createPerson(people.length + 1)];
}

export function removePerson(people, personId) {
  if (people.length <= 1) return people; // always keep at least one row to edit
  return people.filter((person) => person.id !== personId);
}

export function updatePersonName(people, personId, name) {
  return people.map((person) => (person.id === personId ? { ...person, name } : person));
}

export function updatePersonSubtotal(people, personId, subtotal) {
  return people.map((person) => (person.id === personId ? { ...person, subtotal } : person));
}

// --- Formatting ---------------------------------------------------------------------

export function formatCurrency(value, symbol) {
  if (!Number.isFinite(value)) return `${symbol}—`;
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --- Validation ---------------------------------------------------------------------

// Accepts plain integers/decimals and scientific notation, with or
// without a sign - matches what Number() itself accepts, so valid input
// is never rejected before Number() ever sees it.
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

// Never throws. Empty input resolves to 0 when the field is optional
// (tax/fees are fine left blank), or a friendly error when required.
function parseAmount(rawValue, fieldName, { required = false, allowZero = true } = {}) {
  const trimmed = (rawValue ?? '').trim();

  if (trimmed === '') {
    if (required) return { ok: false, error: `Enter ${fieldName}.`, value: null };
    return { ok: true, value: 0 };
  }
  if (!NUMBER_PATTERN.test(trimmed)) {
    return { ok: false, error: `${fieldName} must be a valid number.`, value: null };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${fieldName} is too large to calculate.`, value: null };
  }
  if (value < 0) {
    return { ok: false, error: `${fieldName} can't be negative.`, value: null };
  }
  if (!allowZero && value === 0) {
    return { ok: false, error: `${fieldName} must be greater than zero.`, value: null };
  }

  return { ok: true, error: '', value };
}

// Exported so the custom-split table can validate each person's
// subtotal with the exact same rules (and error wording) as the shared
// bill/tax/fee fields, instead of a second copy of this logic.
export function validatePersonSubtotal(rawValue) {
  return parseAmount(rawValue, 'Subtotal', { required: true, allowZero: true });
}

function validatePeopleCount(rawValue) {
  const trimmed = (rawValue ?? '').trim();
  if (trimmed === '') return { ok: false, error: 'Enter how many people are splitting the bill.', value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Number of people must be a whole number.', value: null };

  const value = Number(trimmed);
  if (value < 1) return { ok: false, error: 'At least 1 person is needed to split the bill.', value: null };
  if (value > MAX_PEOPLE) return { ok: false, error: `This calculator supports up to ${MAX_PEOPLE} people.`, value: null };
  return { ok: true, error: '', value };
}

// Validates the shared bill/tip/tax/fee fields, plus the "Number of
// people" field ONLY when it's actually in use (Equal Split mode) - in
// Custom Split, the person count comes from the people table instead, so
// there's nothing to require there.
export function validateInputs({ billAmount, tipPercent, peopleCount, taxAmount, feesAmount, splitMode }) {
  const errors = {};
  const values = {};

  const bill = parseAmount(billAmount, 'Bill amount', { required: true, allowZero: false });
  if (!bill.ok) errors.billAmount = bill.error;
  else values.billAmount = bill.value;

  const tip = parseAmount(tipPercent, 'Tip percentage', { required: false, allowZero: true });
  if (!tip.ok) errors.tipPercent = tip.error;
  else values.tipPercent = tip.value;

  const tax = parseAmount(taxAmount, 'Tax', { required: false, allowZero: true });
  if (!tax.ok) errors.taxAmount = tax.error;
  else values.taxAmount = tax.value;

  const fees = parseAmount(feesAmount, 'Additional fees', { required: false, allowZero: true });
  if (!fees.ok) errors.feesAmount = fees.error;
  else values.feesAmount = fees.value;

  if (splitMode === 'equal') {
    const people = validatePeopleCount(peopleCount);
    if (!people.ok) errors.peopleCount = people.error;
    else values.peopleCount = people.value;
  }

  return { ok: Object.keys(errors).length === 0, errors, values };
}

// --- The single computed snapshot everything else reads from -----------------------

export function calculateSnapshot({
  billAmount,
  tipPercent,
  taxAmount,
  feesAmount,
  peopleCount,
  splitMode,
  customPeople,
  roundingMode,
  currencySymbol,
}) {
  const tipAmount = applyTipRounding(calculateTip(billAmount, tipPercent), roundingMode);
  const grandTotal = applyTotalRounding(
    calculateTotal({ billAmount, tipAmount, taxAmount, feesAmount }),
    roundingMode,
  );

  const perPerson =
    splitMode === 'equal'
      ? splitBillEqually({ billAmount, tipAmount, taxAmount, feesAmount, peopleCount, roundingMode })
      : splitBillProportionally(
          customPeople.map((person) => ({ ...person, subtotal: Number(person.subtotal) || 0 })),
          { tipAmount, taxAmount, feesAmount, roundingMode },
        );

  return {
    billAmount,
    tipPercent,
    tipAmount,
    taxAmount,
    feesAmount,
    grandTotal,
    splitMode,
    currencySymbol,
    perPerson,
  };
}

// --- Text export: summary, per-person breakdown, and full receipt ------------------

export function buildSummaryText(snapshot) {
  const { currencySymbol, billAmount, tipPercent, tipAmount, taxAmount, feesAmount, grandTotal } = snapshot;
  const lines = [
    `Bill subtotal: ${formatCurrency(billAmount, currencySymbol)}`,
    `Tip (${tipPercent}%): ${formatCurrency(tipAmount, currencySymbol)}`,
  ];
  if (taxAmount > 0) lines.push(`Tax: ${formatCurrency(taxAmount, currencySymbol)}`);
  if (feesAmount > 0) lines.push(`Additional fees: ${formatCurrency(feesAmount, currencySymbol)}`);
  lines.push(`Grand total: ${formatCurrency(grandTotal, currencySymbol)}`);
  return lines.join('\n');
}

export function buildPerPersonText(snapshot) {
  return snapshot.perPerson
    .map((person) => `${person.name}: ${formatCurrency(person.total, snapshot.currencySymbol)}`)
    .join('\n');
}

export function exportReceipt(snapshot) {
  const peopleCount = snapshot.perPerson.length;
  const splitLine =
    snapshot.splitMode === 'equal'
      ? `Split equally among ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}:`
      : 'Custom (proportional) split:';

  return [
    'TIP CALCULATOR - RECEIPT SUMMARY',
    '================================',
    '',
    buildSummaryText(snapshot),
    '',
    splitLine,
    '--------------------------------',
    buildPerPersonText(snapshot),
    '',
    `Generated by Rootconverter - ${new Date().toLocaleString()}`,
  ].join('\n');
}

// --- Recent calculations -------------------------------------------------------------

// Adds one entry to the front of the recent-calculations list, skipping
// an exact duplicate of whatever's already at the front, capped at
// `maxEntries`.
export function saveCalculation(recentList, entry, maxEntries = 10) {
  const latest = recentList[0];
  if (latest && JSON.stringify(latest.inputs) === JSON.stringify(entry.inputs)) return recentList;
  return [entry, ...recentList].slice(0, maxEntries);
}
