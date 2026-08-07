// -----------------------------------------------------------------------
// STEP REGISTRY
//
// The set of steps that actually exist. `route()` in machine.js takes
// this set and uses it to pick the next step, which is what lets the
// state graph describe the whole system (phases 1-4) while the runner
// only ever attempts what's built.
//
// Adding a step in a later phase is: write the module, add it here.
// -----------------------------------------------------------------------

import * as review from './review.js';
import * as assemble from './assemble.js';
import * as stage from './stage.js';
import * as publish from './publish.js';

export const STEPS = new Map([
  [review.name, review],
  [assemble.name, assemble],
  [stage.name, stage],
  [publish.name, publish],
]);

/** Step names implemented right now - passed to machine.route(). */
export const IMPLEMENTED = new Set(STEPS.keys());

export function getStep(stepName) {
  return STEPS.get(stepName) ?? null;
}
