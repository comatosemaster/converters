// Minimal Resend API client (https://resend.com/docs/api-reference).
//
// RESEND_API_URL can point somewhere else - the local end-to-end test
// runs a fake Resend server and sets it, so tests never email anyone.

const DEFAULT_API = 'https://api.resend.com';
export const BATCH_LIMIT = 100;

function apiBase(env) {
  return (env.RESEND_API_URL || DEFAULT_API).replace(/\/+$/, '');
}

async function call(env, path, body, idempotencyKey) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  const headers = { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey.slice(0, 256);
  const response = await fetch(`${apiBase(env)}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Resend ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Sends one email: { to, subject, html, text, headers? }. */
export function sendEmail(env, email, idempotencyKey) {
  return call(env, '/emails', withDefaults(env, email), idempotencyKey);
}

/** Sends up to 100 individually rendered emails in one request. */
export function sendBatch(env, emails, idempotencyKey) {
  if (emails.length > BATCH_LIMIT) throw new Error(`A batch holds at most ${BATCH_LIMIT} emails`);
  return call(env, '/emails/batch', emails.map((email) => withDefaults(env, email)), idempotencyKey);
}

function withDefaults(env, email) {
  return {
    from: env.EMAIL_FROM || 'NeatSize <updates@neatsize.com>',
    ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
    ...email,
  };
}
