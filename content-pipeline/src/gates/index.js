// -----------------------------------------------------------------------
// GATE REGISTRY + RUNNER
//
// Adding a quality check is: write a module exporting `id`, `tier`, and
// `run(ctx) -> Verdict`, register it here, and list it in a tier in
// pipeline.config.js. No step, and no part of the pipeline, changes.
//
// Tiers run cheapest-first and stop at the first failing tier. There is
// no reason to pay an SEO reviewer to read an article whose frontmatter
// doesn't parse - and beyond the cost, the later findings would mostly be
// downstream noise from the first failure, burying the real problem.
// -----------------------------------------------------------------------

import * as frontmatterGate from './frontmatter.gate.js';
import * as linksGate from './links.gate.js';
import * as markdownGate from './markdown.gate.js';
import * as dedupGate from './dedup.gate.js';
import * as proseGate from './prose.gate.js';
import { config } from '../../config/pipeline.config.js';
import { assertValid } from '../core/validate.js';
import { ContractError } from '../core/errors.js';

const GATES = new Map(
  [frontmatterGate, linksGate, markdownGate, dedupGate, proseGate].map((gate) => [gate.id, gate]),
);

export function getGate(gateId) {
  const gate = GATES.get(gateId);
  if (!gate) throw new ContractError(`Unknown gate "${gateId}".`, { gateId, known: [...GATES.keys()] });
  return gate;
}

export function listGates() {
  return [...GATES.values()].map((gate) => ({ id: gate.id, tier: gate.tier }));
}

/**
 * Runs the configured gate set against one article.
 *
 * @param ctx { frontmatter, body, slug, corpus }
 * @returns { verdicts, outcome, ranTiers }
 */
export async function runGates(ctx, { only } = {}) {
  const tiers = only
    ? [only.map((gateId) => getGate(gateId).id)]
    : [config.gates.tier0, config.gates.tier1, config.gates.tier2].filter((tier) => tier.length > 0);

  const verdicts = [];
  const ranTiers = [];

  for (const tier of tiers) {
    ranTiers.push(tier);

    for (const gateId of tier) {
      const gate = getGate(gateId);
      const startedAt = Date.now();
      // eslint-disable-next-line no-await-in-loop -- gates within a tier are ordered cheapest-first and share the corpus; concurrency would buy microseconds and cost clarity
      const verdict = await gate.run(ctx);
      verdict.meta = { ...(verdict.meta ?? {}), durationMs: Date.now() - startedAt };

      await assertValid('verdict.schema.json', verdict, { gate: gateId });
      verdicts.push(verdict);
    }

    const tierFailed = verdicts.some((verdict) => verdict.verdict !== 'pass');
    if (tierFailed && config.gates.stopAtFirstFailingTier && !only) break;
  }

  const outcome = verdicts.some((verdict) => verdict.verdict === 'reject')
    ? 'reject'
    : verdicts.some((verdict) => verdict.verdict === 'revise')
      ? 'revise'
      : 'pass';

  return { verdicts, outcome, ranTiers };
}
