// -----------------------------------------------------------------------
// THE STATE MACHINE
//
// The full graph is declared here, including states no step implements
// yet. That's deliberate: phases 2-4 add step IMPLEMENTATIONS, not new
// pipeline concepts, so the shape of the system is visible from day one
// and later phases can't quietly redefine it.
//
// Several states have more than one outgoing transition, and which one is
// correct depends on two things: which steps exist yet, and (after a
// review) what the verdict was. Rather than encoding that in array order -
// which breaks silently the moment a transition is added - routing is an
// explicit function that takes the set of implemented steps.
// -----------------------------------------------------------------------

import { ContractError } from './errors.js';

export const STATES = {
  queued: { terminal: false, description: 'Topic accepted, nothing produced yet.' },
  researched: { terminal: false, description: 'Sources and tool facts gathered.' },
  outlined: { terminal: false, description: 'Structure agreed, no prose yet.' },
  drafted: { terminal: false, description: 'Body written, unreviewed.' },
  edited: { terminal: false, description: 'Line-edited and style-conformed.' },
  reviewed: { terminal: false, description: 'Gates have run; a verdict is recorded.' },
  revising: { terminal: false, description: 'Findings are being addressed.' },
  assembled: { terminal: false, description: 'Final markdown produced.' },
  staged: { terminal: false, description: 'Written to the site and build-verified.' },
  published: { terminal: true, description: 'Pull request opened.' },
  quarantined: { terminal: true, description: 'Needs a human decision.' },
  abandoned: { terminal: true, description: 'Dropped deliberately.' },
};

// `phase` documents when each step arrives. Nothing reads it at runtime -
// it's here so the graph explains itself to the next person reading it.
export const TRANSITIONS = [
  { from: 'queued', to: 'researched', step: 'research', phase: 4 },
  { from: 'researched', to: 'outlined', step: 'outline', phase: 2 },
  // Skips research, which doesn't exist yet. Once it does, `route()`
  // prefers the transition declared first, so a queued job will start
  // going through research automatically with no change here - the same
  // mechanism that lets an ingested markdown file skip straight to review.
  { from: 'queued', to: 'outlined', step: 'outline', phase: 2 },
  { from: 'outlined', to: 'drafted', step: 'draft', phase: 2 },
  { from: 'drafted', to: 'edited', step: 'edit', phase: 3 },
  { from: 'drafted', to: 'reviewed', step: 'review', phase: 1 },
  { from: 'edited', to: 'reviewed', step: 'review', phase: 1 },
  { from: 'reviewed', to: 'assembled', step: 'assemble', phase: 1 },
  { from: 'reviewed', to: 'revising', step: 'revise', phase: 3 },
  { from: 'revising', to: 'reviewed', step: 'review', phase: 1 },
  { from: 'assembled', to: 'staged', step: 'stage', phase: 1 },
  { from: 'staged', to: 'published', step: 'publish', phase: 1 },
];

export function isTerminal(state) {
  return Boolean(STATES[state]?.terminal);
}

// States a step may legally run from. Steps assert this before doing any
// work, so a mis-ordered CLI invocation fails immediately with a clear
// message instead of half-producing an artifact from missing inputs.
export function entryStatesFor(stepName) {
  return TRANSITIONS.filter((t) => t.step === stepName).map((t) => t.from);
}

export function assertCanRun(stepName, job) {
  const allowed = entryStatesFor(stepName);
  if (allowed.length === 0) {
    throw new ContractError(`Unknown step "${stepName}".`, { stepName });
  }
  if (!allowed.includes(job.state)) {
    throw new ContractError(
      `Step "${stepName}" cannot run on a job in state "${job.state}" (expects: ${allowed.join(', ')}).`,
      { stepName, state: job.state, allowed },
    );
  }
}

// Decides which step the runner should invoke next.
//
// Returns one of:
//   { kind: 'step',      step }            - run it
//   { kind: 'terminal' }                   - nothing left to do
//   { kind: 'blocked',   step, reason }    - the next step isn't built yet
//   { kind: 'halt',      reason }          - needs a human (e.g. failed review,
//                                            with no reviser available)
//
// `implemented` is a Set of step names that actually exist. Passing it in
// (rather than importing the step registry) keeps this module free of
// circular imports, since every step imports assertCanRun from here.
export function route(job, implemented) {
  if (isTerminal(job.state)) return { kind: 'terminal' };

  // After a review, the recorded verdict - not the graph - decides where
  // the job goes. This is the one place the pipeline branches on content
  // quality rather than on structure.
  if (job.state === 'reviewed') {
    const verdict = job.lastVerdict?.verdict ?? 'pass';

    if (verdict === 'pass') {
      return implemented.has('assemble')
        ? { kind: 'step', step: 'assemble' }
        : { kind: 'blocked', step: 'assemble', reason: 'assemble step not implemented' };
    }

    if (verdict === 'reject') {
      return { kind: 'halt', reason: 'A gate rejected this article outright; it needs a human decision.' };
    }

    // verdict === 'revise'
    return implemented.has('revise')
      ? { kind: 'step', step: 'revise' }
      : {
          kind: 'halt',
          reason:
            'Review found fixable problems, but the automated reviser does not exist yet (phase 3). Fix the source and re-ingest, or release it manually.',
        };
  }

  // Everywhere else: take the first outgoing transition whose step exists.
  // This is what lets a hand-written article ingested at `drafted` skip
  // straight to `review` in phase 1, and automatically route through
  // `edit` instead once phase 3 lands - with no change to this function.
  const outgoing = TRANSITIONS.filter((t) => t.from === job.state);
  const runnable = outgoing.find((t) => implemented.has(t.step));
  if (runnable) return { kind: 'step', step: runnable.step };

  const next = outgoing[0];
  return next
    ? { kind: 'blocked', step: next.step, reason: `${next.step} step not implemented (phase ${next.phase})` }
    : { kind: 'halt', reason: `No transition defined out of state "${job.state}".` };
}
