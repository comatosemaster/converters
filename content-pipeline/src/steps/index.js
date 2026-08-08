// -----------------------------------------------------------------------
// STEP REGISTRY
//
// The set of steps that actually exist. `route()` in machine.js takes
// this set and uses it to pick the next step, which is what lets the
// state graph describe the whole system (phases 1-4) while the runner
// only ever attempts what's built.
//
// Still unimplemented: `research` (phase 4, external source gathering)
// and `edit` (a separate editorial pass - currently folded into the
// writer prompt's house-style instructions). Both are transitions the
// graph already knows about, so adding them is writing a module and
// adding a line here.
// -----------------------------------------------------------------------

import * as outline from './outline.js';
import * as draft from './draft.js';
import * as review from './review.js';
import * as revise from './revise.js';
import * as assemble from './assemble.js';
import * as stage from './stage.js';
import * as publish from './publish.js';

export const STEPS = new Map([
  [outline.name, outline],
  [draft.name, draft],
  [review.name, review],
  [revise.name, revise],
  [assemble.name, assemble],
  [stage.name, stage],
  [publish.name, publish],
]);

/** Step names implemented right now - passed to machine.route(). */
export const IMPLEMENTED = new Set(STEPS.keys());

/** Steps that call a model, for cost reporting and --mock warnings. */
export const LLM_STEPS = new Set([outline.name, draft.name, revise.name]);

export function getStep(stepName) {
  return STEPS.get(stepName) ?? null;
}
