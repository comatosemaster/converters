// Shared helpers for the local end-to-end tests (run against `wrangler dev`).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SITE = process.env.E2E_SITE || 'http://localhost:8787';
export const RESEND = process.env.E2E_RESEND || 'http://127.0.0.1:4300';

let failures = 0;
export function check(condition, message) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`);
  if (!condition) failures += 1;
}
export const failureCount = () => failures;

/** Runs SQL on the LOCAL D1 (the one `wrangler dev` uses). Never --remote. */
// wrangler's own entry file, run with this Node - no shell, so the SQL is
// passed as one argument on every OS.
const WRANGLER = fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url));

export function sql(statement) {
  const out = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', 'neatsize-db', '--local', '--json', '--command', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out)[0]?.results ?? [];
}

export const sent = () => fetch(`${RESEND}/_sent`).then((r) => r.json());
export const resetSent = () => fetch(`${RESEND}/_reset`, { method: 'POST' });
export const failNextSends = (count) => fetch(`${RESEND}/_fail?count=${count}`, { method: 'POST' });

export function linkFrom(email, path) {
  const match = email.text.match(new RegExp(`https?://[^\\s]*${path.replace('?', '\\?')}[^\\s]*`));
  return match?.[0] ?? null;
}

export async function api(path, body, { origin = SITE, headers = {} } = {}) {
  const response = await fetch(`${SITE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), ...headers },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    // not JSON
  }
  return { status: response.status, data, location: response.headers.get('location') };
}

// Cloudflare's always-pass test keys accept any token string server-side.
export const TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/**
 * Runs the Worker's scheduled (cron) handler in `wrangler dev`, as if it
 * fired at `when`. (/__scheduled doesn't reach the Worker here, because
 * run_worker_first only sends /api/* to it.)
 */
export async function triggerCron(when = new Date()) {
  const response = await fetch(`${SITE}/cdn-cgi/local/explorer/api/local/scheduled?worker=converters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cron: '0 5 * * *', scheduled_time: when.getTime() }),
  });
  const result = await response.json();
  if (result.result?.outcome !== 'ok') throw new Error(`cron run failed: ${JSON.stringify(result)}`);
  return result;
}
