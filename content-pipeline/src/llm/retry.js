// -----------------------------------------------------------------------
// TRANSPORT RETRY  (retry layer 1 of 3 - see docs/architecture §8)
//
// This layer handles ONLY "the network flaked": rate limits, 5xx,
// timeouts. It deliberately does not handle malformed output (layer 2,
// llm/structured.js) or content that failed review (layer 3, the revise
// step).
//
// Conflating them is the classic expensive bug: retrying a deterministic
// schema violation five times buys the same malformed output five times,
// at full price.
// -----------------------------------------------------------------------

import { TransientError } from '../core/errors.js';

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429 and 5xx are worth retrying. 4xx (bad request, auth, quota
// exhausted) will fail identically no matter how many times we ask.
function isRetryable(error) {
  if (error instanceof TransientError) return true;
  const status = error?.status ?? error?.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  return ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND'].includes(error?.code);
}

// Honour the server's own backoff instruction when it gives one - it
// knows about capacity we can't see.
function retryAfterMs(error) {
  const header = error?.headers?.['retry-after'] ?? error?.response?.headers?.['retry-after'];
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

export async function withRetry(fn, { onRetry } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential by definition; this is a retry loop
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break;

      // Exponential backoff with jitter. The jitter matters when several
      // jobs are running: without it, retries synchronise and hit the
      // rate limit again in lockstep.
      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
      const jitter = Math.random() * backoff * 0.3;
      const delay = retryAfterMs(error) ?? backoff + jitter;

      onRetry?.({ attempt, delay, error });
      // eslint-disable-next-line no-await-in-loop -- deliberate pause between attempts
      await sleep(delay);
    }
  }

  if (isRetryable(lastError)) {
    throw new TransientError(`Model call failed after ${MAX_ATTEMPTS} attempts: ${lastError.message}`, {
      cause: lastError.message,
    });
  }
  throw lastError;
}
