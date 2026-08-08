// -----------------------------------------------------------------------
// STEP: revise  (agent)
//
// Closes the quality loop: takes the findings a review produced and makes
// targeted fixes, then hands back for re-review.
//
// This is the step with the most ways to waste money, so it has three
// guards, all of which matter:
//
//   1. BOUNDED BUDGET   - max revisions per gate and per job. Without it,
//                         "send it back for improvement" is an unbounded
//                         spend loop.
//   2. OSCILLATION      - if error count doesn't fall between rounds, the
//                         model is fixing one gate while regressing
//                         another. Further attempts are provably wasted,
//                         so stop early rather than exhaust the budget.
//   3. DIFF-SCOPED      - the prompt receives only the specific findings,
//                         never "improve this article". Open-ended
//                         rewrites are what cause the oscillation in the
//                         first place.
//
// Anything that trips a guard goes to quarantine, which is not a failure:
// it means the system correctly decided a human should look.
// -----------------------------------------------------------------------

import { loadJob, quarantine, recordArtifact, saveJob, transition } from '../core/job.js';
import { assertCanRun } from '../core/machine.js';
import { writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { runAgent, buildAgentContext } from '../llm/agent.js';
import { config } from '../../config/pipeline.config.js';
import { countErrors, readLatestDraft, readLatestReview, readReviewHistory } from '../util/artifacts.js';
import { draftToMarkdown } from '../util/markdown.js';
import { ContractError } from '../core/errors.js';

export const name = 'revise';

// Findings the reviser can actually act on. `info` is context, and
// passing warnings the model can't fix without unrequested edits invites
// exactly the collateral changes rule 3 exists to prevent.
function actionableFindings(review) {
  const findings = [];
  for (const verdict of review.verdicts ?? []) {
    for (const finding of verdict.findings) {
      if (finding.severity === 'info') continue;
      findings.push({ gate: verdict.gate, ...finding });
    }
  }
  return findings;
}

// True when the last two rounds failed to reduce the error count.
function isOscillating(history) {
  const window = config.revisions.oscillationWindow;
  if (history.length < window + 1) return false;

  const recent = history.slice(-(window + 1)).map(({ value }) => countErrors(value));
  // Improving at any point in the window is enough to keep going.
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] < recent[i - 1]) return false;
  }
  return true;
}

export async function run(jobId) {
  const job = await loadJob(jobId);
  assertCanRun(name, job);

  const review = await readLatestReview(jobId);
  if (!review) throw new ContractError(`Job "${jobId}" has no review to revise against.`, { jobId });

  const draft = await readLatestDraft(jobId);
  if (!draft) {
    // Hand-ingested markdown has no structured form, so there's nothing
    // for the reviser to edit safely. Fixing the source file by hand and
    // re-ingesting is the correct move, and saying so beats failing
    // cryptically.
    await quarantine(
      job,
      'This job was ingested as a markdown file rather than generated, so there is no structured draft to revise. Fix the source file and re-ingest.',
    );
    return { job, ok: false, reason: 'no-structured-draft' };
  }

  // --- Guard 1: revision budget ----------------------------------------

  const revisions = job.revisions ?? { total: 0 };
  const failedGates = (review.value.verdicts ?? [])
    .filter((verdict) => verdict.verdict !== 'pass')
    .map((verdict) => verdict.gate);

  if (revisions.total >= config.revisions.maxPerJob) {
    await quarantine(
      job,
      `Revision budget exhausted (${revisions.total}/${config.revisions.maxPerJob} for this job). Outstanding gates: ${failedGates.join(', ')}.`,
    );
    return { job, ok: false, reason: 'budget-exhausted' };
  }

  const overBudgetGate = failedGates.find((gate) => (revisions[gate] ?? 0) >= config.revisions.maxPerGate);
  if (overBudgetGate) {
    await quarantine(
      job,
      `Gate "${overBudgetGate}" has failed ${revisions[overBudgetGate]} revisions in a row (cap ${config.revisions.maxPerGate}). It is not converging.`,
    );
    return { job, ok: false, reason: 'gate-budget-exhausted', gate: overBudgetGate };
  }

  // --- Guard 2: oscillation --------------------------------------------

  const history = await readReviewHistory(jobId);
  if (isOscillating(history)) {
    await quarantine(
      job,
      `Revisions stopped improving: error count did not fall across the last ${config.revisions.oscillationWindow} rounds (${history.map(({ value }) => countErrors(value)).join(' → ')}). Further attempts would be wasted.`,
    );
    return { job, ok: false, reason: 'oscillating' };
  }

  // --- Guard 3: diff-scoped revision -----------------------------------

  const findings = actionableFindings(review.value);
  const context = await buildAgentContext();

  const { value: revised, meta } = await runAgent({
    agentId: 'reviser',
    job,
    variables: {
      draft: draft.value,
      findings,
      tools: context.tools,
      houseStyle: context.houseStyle,
    },
  });

  // Preserve fields the reviser has no business changing - the slug is
  // the URL, and the publish date is a fact about when this was written.
  revised.frontmatter = {
    ...draft.value.frontmatter,
    ...revised.frontmatter,
    slug: draft.value.frontmatter.slug,
    publishDate: draft.value.frontmatter.publishDate,
  };

  const nextVersion = (draft.stem === 'revised' ? draft.version : 1) + 1;
  await writeArtifact(jobId, `revised.v${nextVersion}.json`, revised);
  await recordArtifact(job, `revised.v${nextVersion}.json`);
  await writeArtifact(jobId, `revised.v${nextVersion}.md`, draftToMarkdown(revised));
  await recordArtifact(job, `revised.v${nextVersion}.md`);

  // Count this round against both the job total and each failing gate.
  job.revisions = { ...revisions, total: revisions.total + 1 };
  for (const gate of failedGates) {
    job.revisions[gate] = (revisions[gate] ?? 0) + 1;
  }
  await saveJob(job);

  await transition(job, 'revising');
  await EVENTS.stepFinished(jobId, {
    step: name,
    round: job.revisions.total,
    addressed: findings.length,
    gates: failedGates,
    costUsd: meta.costUsd,
  });

  return { job, ok: true, revised, findings };
}
