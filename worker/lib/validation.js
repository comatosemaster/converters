// Input validation for the public API. Pure functions - unit tested in
// worker/tests/validation.test.js.

const EMAIL_MAX = 254;

/** Trimmed, lower-cased email (case doesn't matter for delivery or uniqueness). */
export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * A practical check, not the full RFC 5322 grammar: one @, no spaces, a
 * dotted domain with a 2+ letter ending, and the length limits mail
 * servers enforce. Good enough to catch typos; the confirmation email is
 * the real test.
 */
export function isValidEmail(email) {
  if (!email || email.length > EMAIL_MAX) return false;
  const match = /^([^\s@]+)@([^\s@]+)$/.exec(email);
  if (!match) return false;
  const [, local, domain] = match;
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local)) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((label) => /^[a-z0-9-]{1,63}$/i.test(label) && !label.startsWith('-') && !label.endsWith('-'))) {
    return false;
  }
  return /^[a-z]{2,}$/i.test(labels[labels.length - 1]) || /^xn--[a-z0-9-]+$/i.test(labels[labels.length - 1]);
}

// Where a sign-up came from - free text from the page, so it's kept to a
// short slug and anything else is recorded as 'other'.
export function normalizeSource(value) {
  return typeof value === 'string' && /^[a-z0-9-]{1,32}$/.test(value) ? value : 'other';
}

export const REQUEST_LIMITS = { descriptionMin: 10, descriptionMax: 1000, detailsMax: 1000 };

/**
 * Validates a "Request a Tool" submission. Returns { ok, value } with the
 * cleaned fields, or { ok: false, error } with a message for the visitor.
 */
export function validateToolRequest(body) {
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  const email = normalizeEmail(body.email);
  const notify = body.notify === true || body.notify === 'true' || body.notify === 'on';

  if (description.length < REQUEST_LIMITS.descriptionMin) {
    return { ok: false, error: `Please describe the tool in at least ${REQUEST_LIMITS.descriptionMin} characters.` };
  }
  if (description.length > REQUEST_LIMITS.descriptionMax) {
    return { ok: false, error: `Please keep the description under ${REQUEST_LIMITS.descriptionMax} characters.` };
  }
  if (details.length > REQUEST_LIMITS.detailsMax) {
    return { ok: false, error: `Please keep the example under ${REQUEST_LIMITS.detailsMax} characters.` };
  }
  if (email && !isValidEmail(email)) return { ok: false, error: 'That email address doesn’t look right.' };
  if (notify && !email) return { ok: false, error: 'Add your email address so we can tell you when it ships.' };

  return { ok: true, value: { description, details: details || null, email: email || null, notify } };
}

/** Tokens are 43-character base64url strings (see crypto.js). */
export function isWellFormedToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
