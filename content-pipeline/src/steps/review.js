// -----------------------------------------------------------------------
// STEP: review
//
// Runs the configured gate set and records the outcome. It makes no
// judgement of its own and edits nothing - reviewers judge, the Reviser
// fixes. Keeping those apart matters: a model asked to both critique and
// repair its own work tends to rationalise it as already correct.
//
// The routing decision (assemble vs revise vs quarantine) is left to
// machine.js's `route()`, which reads the verdict this step records. So
// this step's only job is: run gates, write verdicts, set state.
// -----------------------------------------------------------------------

import { loadJob, recordArtifact, transition } from '../core/job.js';
import { assertCanRun } from '../core/machine.js';
import { writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { parseFrontmatter } from '../adapters/site.js';
import { loadCorpus } from '../corpus/index.js';
import { runGates } from '../gates/index.js';
import { readLatestMarkdown } from '../util/artifacts.js';
import { draftToMarkdown } from '../util/markdown.js';

export const name = 'review';

export async function run(jobId) {
  const job = await loadJob(jobId);
  assertCanRun(name, job);
  await EVENTS.stepStarted(job.id, { step: name });

  const source = await readLatestMarkdown(jobId, { draftToMarkdown });
  if (!source) {
    throw new Error(`Job "${jobId}" has no body artifact to review.`);
  }

  const { data: frontmatter, body } = parseFrontmatter(source.raw);
  const slug = job.slug ?? frontmatter.slug;

  // Exclude this article's own slug: when re-reviewing something already
  // staged into the site, it would otherwise be compared against itself
  // and reported as a perfect duplicate.
  const corpus = await loadCorpus({ excludeSlug: slug });

  const { verdicts, outcome } = await runGates({ frontmatter, body, slug, corpus });

  for (const verdict of verdicts) {
    await EVENTS.gateVerdict(job.id, {
      gate: verdict.gate,
      verdict: verdict.verdict,
      errors: verdict.findings.filter((finding) => finding.severity === 'error').length,
      warnings: verdict.findings.filter((finding) => finding.severity === 'warn').length,
    });
  }

  // Versioned so each review round is preserved - comparing round N to
  // round N+1 is how you tell whether a revision actually helped, which
  // is also what the phase-3 oscillation detector will read.
  const round = (job.revisions?.total ?? 0) + 1;
  const artifactName = round === 1 ? 'review.json' : `review.v${round}.json`;
  await writeArtifact(job.id, artifactName, { outcome, verdicts, reviewedArtifact: source.name });
  await recordArtifact(job, artifactName);

  const failedGates = verdicts.filter((verdict) => verdict.verdict !== 'pass').map((verdict) => verdict.gate);

  await transition(job, 'reviewed', {
    lastVerdict: { verdict: outcome, at: new Date().toISOString(), failedGates },
  });

  await EVENTS.stepFinished(job.id, { step: name, outcome, failedGates });

  return { job, outcome, verdicts };
}
