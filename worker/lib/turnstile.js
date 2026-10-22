// Server-side check of a Cloudflare Turnstile token. The widget on the
// page only produces a token; this is what actually verifies it.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, { secret, ip, fetchImpl = fetch }) {
  if (!secret) return { ok: false, reason: 'not-configured' };
  if (typeof token !== 'string' || !token || token.length > 2048) return { ok: false, reason: 'missing-token' };
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const response = await fetchImpl(VERIFY_URL, { method: 'POST', body: form });
    const result = await response.json();
    return result.success ? { ok: true } : { ok: false, reason: (result['error-codes'] || []).join(',') || 'rejected' };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
