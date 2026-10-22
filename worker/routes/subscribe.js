// POST /api/subscribe  { email, source, turnstileToken }

import { clientIp, json, readBody } from '../lib/http.js';
import { hashIp } from '../lib/crypto.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { isValidEmail, normalizeEmail, normalizeSource } from '../lib/validation.js';
import { startSubscription } from '../lib/subscribers.js';
import { sendConfirmation } from '../lib/confirmation.js';

// The same answer for a new address, a pending one and an already-active
// one, so the form can't be used to find out who is subscribed.
export const SUBSCRIBE_SUCCESS =
  'Almost done - check your inbox for a confirmation link. If you’re already subscribed, there’s nothing else to do.';

export async function handleSubscribe(request, env) {
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'That request couldn’t be read.' }, 400);

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return json({ ok: false, error: 'Please enter a valid email address.' }, 400);

  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env.IP_HASH_SALT);
  const rate = await checkRateLimit(env.DB, ipHash, 'subscribe');
  if (!rate.allowed) {
    return json({ ok: false, error: 'Too many attempts from your connection. Please try again in an hour.' }, 429);
  }

  const captcha = await verifyTurnstile(body.turnstileToken, { secret: env.TURNSTILE_SECRET_KEY, ip });
  if (!captcha.ok) return json({ ok: false, error: 'The spam check didn’t go through. Please try again.' }, 400);

  const result = await startSubscription(env.DB, { email, source: normalizeSource(body.source), ipHash });
  if (result.state === 'pending') {
    const sent = await sendConfirmation(env, { email, confirmToken: result.confirmToken });
    if (!sent) {
      return json({ ok: false, error: 'We couldn’t send the confirmation email just now. Please try again in a few minutes.' }, 502);
    }
  }
  return json({ ok: true, message: SUBSCRIBE_SUCCESS });
}
