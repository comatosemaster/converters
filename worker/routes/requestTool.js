// POST /api/request-tool  { description, details?, email?, notify?, turnstileToken }

import { clientIp, json, readBody } from '../lib/http.js';
import { hashIp } from '../lib/crypto.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { validateToolRequest } from '../lib/validation.js';
import { startSubscription } from '../lib/subscribers.js';
import { sendConfirmation } from '../lib/confirmation.js';

export async function handleRequestTool(request, env) {
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'That request couldn’t be read.' }, 400);

  const checked = validateToolRequest(body);
  if (!checked.ok) return json({ ok: false, error: checked.error }, 400);
  const { description, details, email, notify } = checked.value;

  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env.IP_HASH_SALT);
  const rate = await checkRateLimit(env.DB, ipHash, 'request');
  if (!rate.allowed) {
    return json({ ok: false, error: 'Too many requests from your connection. Please try again in an hour.' }, 429);
  }

  const captcha = await verifyTurnstile(body.turnstileToken, { secret: env.TURNSTILE_SECRET_KEY, ip });
  if (!captcha.ok) return json({ ok: false, error: 'The spam check didn’t go through. Please try again.' }, 400);

  // "Email me when it ships" = a normal (double opt-in) subscription,
  // linked to the request so its digest can mention it.
  let subscription = null;
  if (notify) subscription = await startSubscription(env.DB, { email, source: 'request', ipHash });

  await env.DB
    .prepare(
      `INSERT INTO tool_requests (description, details, email, subscriber_id, status, created_at, ip_hash)
       VALUES (?1, ?2, ?3, ?4, 'new', ?5, ?6)`,
    )
    .bind(description, details, email, subscription?.id ?? null, new Date().toISOString(), ipHash)
    .run();

  if (subscription?.state === 'pending') {
    const sent = await sendConfirmation(env, { email, confirmToken: subscription.confirmToken, request: description });
    if (!sent) {
      return json({
        ok: true,
        message: 'Thanks - your request is in. We couldn’t send the confirmation email just now, so subscribe again later from the bottom of any page to hear when it ships.',
      });
    }
  }

  return json({
    ok: true,
    message: notify
      ? 'Thanks - your request is in. To hear when it ships, confirm your email with the link we just sent (if you’re already subscribed, you’re all set).'
      : 'Thanks - your request is in. New tools are announced on the homepage and in the blog.',
  });
}
