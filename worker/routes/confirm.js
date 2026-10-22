// GET /api/confirm?token=...  (the link in the confirmation email)

import { redirect } from '../lib/http.js';
import { isWellFormedToken } from '../lib/validation.js';
import { confirmSubscription } from '../lib/subscribers.js';

export async function handleConfirm(request, env) {
  const token = new URL(request.url).searchParams.get('token');
  const confirmed = isWellFormedToken(token) && (await confirmSubscription(env.DB, token));
  // /subscribed is a prerendered page; ?status=invalid makes it explain an
  // expired or already-used link instead of saying "you're in".
  return redirect(confirmed ? '/subscribed' : '/subscribed?status=invalid');
}
