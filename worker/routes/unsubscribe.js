// GET  /api/unsubscribe?token=...  -> a page with one "Unsubscribe" button
// POST /api/unsubscribe            -> unsubscribes, then /unsubscribed
//
// The GET deliberately changes nothing: mail security scanners open links
// in emails automatically, and an unsubscribe-on-GET would quietly drop
// people who never clicked. The POST also handles RFC 8058 one-click
// unsubscribe, which mail apps (Gmail, Apple Mail...) send as
// "List-Unsubscribe=One-Click" with the token in the URL.

import { html, methodNotAllowed, readBody, redirect } from '../lib/http.js';
import { isWellFormedToken } from '../lib/validation.js';
import { findByUnsubToken, maskEmail, unsubscribe } from '../lib/subscribers.js';
import { messagePage, unsubscribePage } from '../lib/pages.js';

const INVALID = () =>
  html(
    messagePage({
      title: 'This link doesn’t work',
      message: 'The unsubscribe link is incomplete or no longer valid. Use the link in your most recent NeatSize email, or reply to it and we’ll remove you by hand.',
    }),
    400,
  );

export async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);

  if (request.method === 'GET' || request.method === 'HEAD') {
    const token = url.searchParams.get('token');
    if (!isWellFormedToken(token)) return INVALID();
    const subscriber = await findByUnsubToken(env.DB, token);
    if (!subscriber) return INVALID();
    if (subscriber.status === 'unsubscribed') return redirect('/unsubscribed');
    return html(unsubscribePage({ token, maskedEmail: maskEmail(subscriber.email) }));
  }

  if (request.method !== 'POST') return methodNotAllowed('GET, POST');

  const body = (await readBody(request)) ?? {};
  const oneClick = body['List-Unsubscribe'] === 'One-Click';
  const token = oneClick ? url.searchParams.get('token') : body.token || url.searchParams.get('token');
  if (!isWellFormedToken(token)) return oneClick ? new Response('Invalid token', { status: 400 }) : INVALID();

  const found = await unsubscribe(env.DB, token);
  if (oneClick) return new Response(found ? 'Unsubscribed' : 'Invalid token', { status: found ? 200 : 400 });
  return found ? redirect('/unsubscribed') : INVALID();
}
