// -----------------------------------------------------------------------
// QR PAYLOAD BUILDING + VALIDATION - no React, no DOM. Each QR "type" here
// (URL, WiFi, vCard, ...) has its own well-known text format that phone
// camera apps already know how to interpret (a phone doesn't know or care
// that a QR code came from this site - it just reads the text and acts on
// its format). These functions build that exact text, and check that the
// fields needed to build it validly are actually filled in.
// -----------------------------------------------------------------------

function isBlank(value) {
  return !value || !value.trim();
}

// --- URL ------------------------------------------------------------------

function withScheme(url) {
  // Lets people type "example.com" without worrying about the protocol.
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

function validateUrl(fields) {
  if (isBlank(fields.url)) return { ok: false, error: 'Enter a website URL.' };
  try {
    // eslint-disable-next-line no-new
    new URL(withScheme(fields.url.trim()));
    return { ok: true, error: '' };
  } catch {
    return { ok: false, error: 'Enter a valid URL, e.g. https://example.com' };
  }
}

function buildUrlPayload(fields) {
  return withScheme(fields.url.trim());
}

// --- Text -------------------------------------------------------------------

function validateText(fields) {
  if (isBlank(fields.text)) return { ok: false, error: 'Enter some text.' };
  return { ok: true, error: '' };
}

function buildTextPayload(fields) {
  return fields.text;
}

// --- Email --------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(fields) {
  if (isBlank(fields.emailAddress)) return { ok: false, error: 'Enter an email address.' };
  if (!EMAIL_REGEX.test(fields.emailAddress.trim())) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, error: '' };
}

function buildEmailPayload(fields) {
  const params = new URLSearchParams();
  if (fields.emailSubject) params.set('subject', fields.emailSubject);
  if (fields.emailMessage) params.set('body', fields.emailMessage);
  const query = params.toString();
  return `mailto:${fields.emailAddress.trim()}${query ? `?${query}` : ''}`;
}

// --- Phone --------------------------------------------------------------------

// Accepts international numbers: an optional leading +, then digits,
// spaces, hyphens, or parentheses.
const PHONE_REGEX = /^\+?[\d\s()-]{5,}$/;

function validatePhoneField(fields, key) {
  if (isBlank(fields[key])) return { ok: false, error: 'Enter a phone number.' };
  if (!PHONE_REGEX.test(fields[key].trim())) {
    return { ok: false, error: 'Enter a valid phone number (digits, spaces, +, -, and () only).' };
  }
  return { ok: true, error: '' };
}

function buildPhonePayload(fields) {
  return `tel:${fields.phone.trim().replace(/[\s()-]/g, '')}`;
}

// --- SMS ----------------------------------------------------------------------

function validateSms(fields) {
  return validatePhoneField(fields, 'smsPhone');
}

function buildSmsPayload(fields) {
  const phone = fields.smsPhone.trim().replace(/[\s()-]/g, '');
  return `smsto:${phone}:${fields.smsMessage || ''}`;
}

// --- WiFi ---------------------------------------------------------------------

// The WiFi QR format treats \ ; , and " as special, so a literal one
// inside the network name or password has to be backslash-escaped.
function escapeWifiValue(value) {
  return value.replace(/([\\;,":])/g, '\\$1');
}

function validateWifi(fields) {
  if (isBlank(fields.wifiSsid)) return { ok: false, error: 'Enter the network name (SSID).' };
  if (fields.wifiSecurity !== 'nopass' && isBlank(fields.wifiPassword)) {
    return { ok: false, error: 'Enter the network password, or set security to None.' };
  }
  return { ok: true, error: '' };
}

function buildWifiPayload(fields) {
  const isOpen = fields.wifiSecurity === 'nopass';
  const ssid = escapeWifiValue(fields.wifiSsid.trim());
  const password = isOpen ? '' : escapeWifiValue(fields.wifiPassword.trim());
  return `WIFI:T:${fields.wifiSecurity};S:${ssid};P:${password};;`;
}

// --- Contact (vCard) ------------------------------------------------------------

function validateVcard(fields) {
  if (isBlank(fields.vcardFirstName) && isBlank(fields.vcardLastName)) {
    return { ok: false, error: 'Enter at least a first or last name.' };
  }
  return { ok: true, error: '' };
}

function buildVcardPayload(fields) {
  const firstName = (fields.vcardFirstName || '').trim();
  const lastName = (fields.vcardLastName || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${lastName};${firstName};;;`, `FN:${fullName}`];
  if (fields.vcardCompany?.trim()) lines.push(`ORG:${fields.vcardCompany.trim()}`);
  if (fields.vcardTitle?.trim()) lines.push(`TITLE:${fields.vcardTitle.trim()}`);
  if (fields.vcardPhone?.trim()) lines.push(`TEL:${fields.vcardPhone.trim()}`);
  if (fields.vcardEmail?.trim()) lines.push(`EMAIL:${fields.vcardEmail.trim()}`);
  if (fields.vcardWebsite?.trim()) lines.push(`URL:${fields.vcardWebsite.trim()}`);
  if (fields.vcardAddress?.trim()) lines.push(`ADR:;;${fields.vcardAddress.trim()};;;;`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

// --- Location -------------------------------------------------------------------

function validateLocation(fields) {
  if (isBlank(fields.lat) || isBlank(fields.lng)) {
    return { ok: false, error: 'Enter both latitude and longitude.' };
  }
  const lat = Number(fields.lat);
  const lng = Number(fields.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: 'Latitude must be a number between -90 and 90.' };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: 'Longitude must be a number between -180 and 180.' };
  }
  return { ok: true, error: '' };
}

function buildLocationPayload(fields) {
  return `geo:${Number(fields.lat)},${Number(fields.lng)}`;
}

// --- Public API -----------------------------------------------------------------

const HANDLERS = {
  url: { validate: validateUrl, build: buildUrlPayload, isEmpty: (f) => isBlank(f.url) },
  text: { validate: validateText, build: buildTextPayload, isEmpty: (f) => isBlank(f.text) },
  email: {
    validate: validateEmail,
    build: buildEmailPayload,
    isEmpty: (f) => isBlank(f.emailAddress) && isBlank(f.emailSubject) && isBlank(f.emailMessage),
  },
  phone: {
    validate: (f) => validatePhoneField(f, 'phone'),
    build: buildPhonePayload,
    isEmpty: (f) => isBlank(f.phone),
  },
  sms: {
    validate: validateSms,
    build: buildSmsPayload,
    isEmpty: (f) => isBlank(f.smsPhone) && isBlank(f.smsMessage),
  },
  wifi: {
    validate: validateWifi,
    build: buildWifiPayload,
    isEmpty: (f) => isBlank(f.wifiSsid) && isBlank(f.wifiPassword),
  },
  vcard: {
    validate: validateVcard,
    build: buildVcardPayload,
    isEmpty: (f) =>
      isBlank(f.vcardFirstName) &&
      isBlank(f.vcardLastName) &&
      isBlank(f.vcardCompany) &&
      isBlank(f.vcardPhone) &&
      isBlank(f.vcardEmail) &&
      isBlank(f.vcardWebsite) &&
      isBlank(f.vcardAddress),
  },
  location: { validate: validateLocation, build: buildLocationPayload, isEmpty: (f) => isBlank(f.lat) && isBlank(f.lng) },
};

// Checks whether the fields relevant to `type` have been touched at all -
// used to show a neutral "fill in the fields" hint instead of a scary
// validation error on a pristine tab.
export function isTypeEmpty(type, fields) {
  return HANDLERS[type].isEmpty(fields);
}

// Validates the fields relevant to `type`. Returns { ok, error }.
export function validateInput(type, fields) {
  return HANDLERS[type].validate(fields);
}

// Validates and, if valid, builds the QR payload text for `type`. Returns
// { ok, error, payload }.
export function buildQrPayload(type, fields) {
  const validation = validateInput(type, fields);
  if (!validation.ok) return { ok: false, error: validation.error, payload: '' };
  return { ok: true, error: '', payload: HANDLERS[type].build(fields) };
}
