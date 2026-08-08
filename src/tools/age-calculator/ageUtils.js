// -----------------------------------------------------------------------
// AGE CALCULATION LOGIC - no React, no DOM. Pure functions only, so this
// file can be read (or reused) completely independently of the UI in
// AgeCalculator.jsx.
//
// Everything uses native Date arithmetic - no date library. Calendar
// (years/months/days) age is computed by walking from the birth date
// forward rather than dividing millisecond spans, which is what makes it
// correctly handle month lengths and leap years without special-casing
// them.
// -----------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// <input type="date"> gives/wants "YYYY-MM-DD" in local time. Parsing it
// with `new Date("YYYY-MM-DD")` would read it as UTC midnight, which then
// prints as the PREVIOUS day in any timezone behind UTC - so a birthday
// typed as "2000-01-01" could quietly become December 31, 1999. Parsing
// the parts by hand keeps it a local-time date throughout.
export function parseDateInputValue(value) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  // Catches "2023-02-30": the Date constructor rolls it over to March 2
  // instead of rejecting it, so the round-trip is checked to confirm the
  // parts survived unchanged.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// --- Validation --------------------------------------------------------

// Returns `{ ok: true, birthDate, asOfDate }` or `{ ok: false, error }` -
// never throws, matching the validate*() pattern used across the site's
// other calculators (see bmi-calculator/bmiUtils.js).
export function validateAgeInputs(birthDateText, asOfDateText) {
  const birthTrimmed = birthDateText.trim();
  const asOfTrimmed = asOfDateText.trim();

  if (!birthTrimmed) return { ok: false, error: '' }; // pristine, not an error yet

  const birthDate = parseDateInputValue(birthTrimmed);
  if (!birthDate) return { ok: false, error: 'Enter a valid date of birth.' };

  // An empty "as of" field defaults to today rather than erroring - the
  // UI always keeps this field pre-filled, but validation stays correct
  // even if it's ever cleared.
  const asOfDate = asOfTrimmed ? parseDateInputValue(asOfTrimmed) : startOfDay(new Date());
  if (!asOfDate) return { ok: false, error: 'Enter a valid "calculate as of" date.' };

  if (birthDate > asOfDate) {
    return { ok: false, error: 'Date of birth cannot be after the "calculate as of" date.' };
  }

  // A generous but real bound - catches a typo like "1899-01-01" with a
  // specific message instead of silently returning a 125-year age.
  const minDate = new Date(1900, 0, 1);
  if (birthDate < minDate) {
    return { ok: false, error: 'Enter a date of birth after January 1, 1900.' };
  }

  return { ok: true, birthDate, asOfDate };
}

// --- Core calculation ----------------------------------------------------

// Calendar age as years/months/days, computed by walking forward from the
// birth date one unit at a time - this is what makes "one month" mean
// "the same day next month" (28-31 days, whatever that month actually
// has) rather than a fixed millisecond span, and what makes Feb 29
// birthdays fall out correctly in non-leap years (see below).
function calendarAge(birthDate, asOfDate) {
  let years = asOfDate.getFullYear() - birthDate.getFullYear();
  let months = asOfDate.getMonth() - birthDate.getMonth();
  let days = asOfDate.getDate() - birthDate.getDate();

  if (days < 0) {
    months -= 1;
    // Days in the month BEFORE asOfDate's month - i.e. how many days that
    // partial month actually contributed.
    const daysInPreviousMonth = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 0).getDate();
    days += daysInPreviousMonth;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days };
}

// This year's occurrence of the birthday, adjusted forward to next year
// if it's already passed. Feb 29 birthdays land on Feb 28 in non-leap
// years - matching how age itself is conventionally counted (someone born
// Feb 29 still turns a year older on Feb 28/Mar 1), rather than the
// birthday just not existing three years out of four.
function nextBirthday(birthDate, asOfDate) {
  const isLeapBirthday = birthDate.getMonth() === 1 && birthDate.getDate() === 29;

  function occurrenceInYear(year) {
    if (isLeapBirthday && !isLeapYear(year)) return new Date(year, 1, 28);
    return new Date(year, birthDate.getMonth(), birthDate.getDate());
  }

  const thisYear = occurrenceInYear(asOfDate.getFullYear());
  if (thisYear >= asOfDate) return thisYear;
  return occurrenceInYear(asOfDate.getFullYear() + 1);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The full result set AgeCalculator.jsx displays, given already-validated
 * birthDate/asOfDate (plain local-time Date objects, midnight-aligned).
 */
export function calculateAge(birthDate, asOfDate) {
  let { years, months, days } = calendarAge(birthDate, asOfDate);

  const isLeapBirthdayObservedEarly =
    birthDate.getMonth() === 1 &&
    birthDate.getDate() === 29 &&
    !isLeapYear(asOfDate.getFullYear()) &&
    asOfDate.getMonth() === 1 &&
    asOfDate.getDate() === 28;

  const isBirthdayToday =
    (asOfDate.getMonth() === birthDate.getMonth() && asOfDate.getDate() === birthDate.getDate()) ||
    isLeapBirthdayObservedEarly;

  // Feb 29 birthdays observed on Feb 28 in a non-leap year are exactly one
  // day short of a full year by strict calendar math (there was no Feb 29
  // to reach), which would otherwise print "24 years, 11 months, 30 days"
  // on the one day the page is also announcing "it's your birthday today"
  // - visibly contradictory. Rounding up to the clean year here matches
  // how birthdays are conventionally observed for Feb 29 births.
  if (isLeapBirthdayObservedEarly) {
    years += 1;
    months = 0;
    days = 0;
  }

  const totalDays = Math.round((startOfDay(asOfDate) - startOfDay(birthDate)) / MS_PER_DAY);
  const totalWeeks = Math.floor(totalDays / 7);
  // Whole calendar months lived, independent of the years/months/days
  // breakdown above (which also carries a remaining-days part) - this is
  // the single running total some people want, e.g. for a baby's age.
  const totalMonths = years * 12 + months;

  const upcomingBirthday = nextBirthday(birthDate, asOfDate);
  const daysUntilBirthday = isBirthdayToday
    ? 0
    : Math.round((startOfDay(upcomingBirthday) - startOfDay(asOfDate)) / MS_PER_DAY);

  return {
    years,
    months,
    days,
    totalMonths,
    totalWeeks,
    totalDays,
    isBirthdayToday,
    nextBirthdayDate: upcomingBirthday,
    daysUntilBirthday,
  };
}

// --- Formatting ----------------------------------------------------------

export function formatDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatLongDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function pluralize(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
