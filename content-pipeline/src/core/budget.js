// -----------------------------------------------------------------------
// BUDGET GUARD
//
// An autonomous loop with an API key attached is a spending loop. The
// revision budget stops a single article iterating forever; this stops
// the total from running away for any other reason - a pathological
// input, a prompt change that inflates output, a step that retries more
// than expected.
//
// Checked BEFORE each call rather than after, so the cap is a limit
// rather than a post-mortem.
// -----------------------------------------------------------------------

import { config } from '../../config/pipeline.config.js';
import { BudgetError } from './errors.js';
import { formatUsd } from '../llm/cost.js';

// Per-process total. A single `run` invocation is one process, so this
// naturally scopes to one run without needing to be persisted.
let runTotalUsd = 0;

export function runTotal() {
  return runTotalUsd;
}

export function recordSpend(usd) {
  runTotalUsd += usd;
  return runTotalUsd;
}

export function resetRunTotal() {
  runTotalUsd = 0;
}

/**
 * Throws if this job (or this run) has spent its allowance.
 * Call before a model call, not after.
 */
export function assertWithinBudget(job, { about } = {}) {
  const jobSpend = job.costUsd ?? 0;

  if (jobSpend >= config.budget.maxUsdPerJob) {
    throw new BudgetError(
      `Job "${job.id}" has spent ${formatUsd(jobSpend)}, at or over its ${formatUsd(config.budget.maxUsdPerJob)} cap. Raise budget.maxUsdPerJob in config/pipeline.config.js, or quarantine the job.`,
      { jobId: job.id, jobSpend, cap: config.budget.maxUsdPerJob, about },
    );
  }

  if (runTotalUsd >= config.budget.maxUsdPerRun) {
    throw new BudgetError(
      `This run has spent ${formatUsd(runTotalUsd)}, at or over its ${formatUsd(config.budget.maxUsdPerRun)} cap.`,
      { runTotalUsd, cap: config.budget.maxUsdPerRun, about },
    );
  }
}

/** Adds a call's cost to both the job record and the run total. */
export function chargeJob(job, usd) {
  job.costUsd = (job.costUsd ?? 0) + usd;
  recordSpend(usd);
  return job.costUsd;
}
