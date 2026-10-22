// -----------------------------------------------------------------------
// THE WORKER
//
// The site itself is static files (dist/, built by `npm run build`) that
// Cloudflare serves without running any code. This Worker only handles:
//   - /api/*   the email subscription and "Request a Tool" endpoints
//     (wrangler.jsonc routes only those paths here - run_worker_first)
//   - the scheduled cron (weekly digest + daily housekeeping)
// Anything else that reaches it is handed straight to the static assets.
// -----------------------------------------------------------------------

import { json, methodNotAllowed } from './lib/http.js';
import { handleSubscribe } from './routes/subscribe.js';
import { handleConfirm } from './routes/confirm.js';
import { handleUnsubscribe } from './routes/unsubscribe.js';
import { runScheduled } from './lib/cron.js';

// Settings the API can't work without. Missing ones are reported as "not
// available yet" instead of failing in confusing ways (see docs/
// email-and-requests-setup.md for how to set them).
const REQUIRED = ['DB', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'IP_HASH_SALT'];

function sameOrigin(request) {
  // Browsers send Origin on POSTs. A form on another site posting here
  // (to sign up someone else's address) is refused outright.
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

async function handleApi(request, env) {
  const { pathname } = new URL(request.url);
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length) {
    console.error('API not configured, missing:', missing.join(', '));
    return json({ ok: false, error: 'Email sign-up isn’t available right now. Please try again later.' }, 503);
  }

  const isPost = request.method === 'POST';
  if (isPost && !sameOrigin(request) && pathname !== '/api/unsubscribe') {
    return json({ ok: false, error: 'Cross-site requests are not allowed.' }, 403);
  }

  switch (pathname) {
    case '/api/subscribe':
      return isPost ? handleSubscribe(request, env) : methodNotAllowed('POST');
    case '/api/confirm':
      return request.method === 'GET' ? handleConfirm(request, env) : methodNotAllowed('GET');
    case '/api/unsubscribe':
      // One-click unsubscribe POSTs come from mail providers' servers, so
      // they carry no matching Origin - the secret token is the check.
      return handleUnsubscribe(request, env);
    default:
      return json({ ok: false, error: 'Not found' }, 404);
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env);
    } catch (error) {
      console.error('API error:', pathname, error?.stack || error);
      return json({ ok: false, error: 'Something went wrong on our side. Please try again later.' }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, new Date(controller.scheduledTime)));
  },
};
