// -----------------------------------------------------------------------
// VERDICT BUILDER
//
// Every gate returns the same envelope, so the routing logic (and, from
// phase 3, the Reviser) can consume any gate's output without knowing
// which gate produced it. This helper exists so that uniformity is the
// path of least resistance rather than a convention gates can forget.
//
// The severity → verdict rule is fixed here, in one place:
//   any error  → revise   (fixable; findings say what to fix)
//   warns only → pass     (recorded and surfaced, but not blocking)
// A gate that needs to REJECT outright (duplicate, wrong premise) says so
// explicitly - that's a judgement, not something to infer from counts.
// -----------------------------------------------------------------------

export function finding(id, severity, message, { location, fixHint } = {}) {
  const result = { id, severity, message };
  if (location) result.location = location;
  if (fixHint) result.fixHint = fixHint;
  return result;
}

export const error = (id, message, options) => finding(id, 'error', message, options);
export const warn = (id, message, options) => finding(id, 'warn', message, options);
export const info = (id, message, options) => finding(id, 'info', message, options);

export function buildVerdict(gate, findings, { score, threshold, meta, forceVerdict } = {}) {
  const hasError = findings.some((item) => item.severity === 'error');
  const verdict = forceVerdict ?? (hasError ? 'revise' : 'pass');

  const result = { gate, verdict, findings };
  if (score !== undefined) result.score = score;
  if (threshold !== undefined) result.threshold = threshold;
  if (meta) result.meta = meta;
  return result;
}

export function countBySeverity(findings) {
  return findings.reduce(
    (counts, item) => {
      counts[item.severity] = (counts[item.severity] ?? 0) + 1;
      return counts;
    },
    { error: 0, warn: 0, info: 0 },
  );
}

/** True if any verdict blocks progress. */
export function isBlocking(verdicts) {
  return verdicts.some((verdict) => verdict.verdict !== 'pass');
}

/** Collapses several gate verdicts into the job-level outcome. */
export function summarize(verdicts) {
  if (verdicts.some((verdict) => verdict.verdict === 'reject')) return 'reject';
  if (verdicts.some((verdict) => verdict.verdict === 'revise')) return 'revise';
  return 'pass';
}
