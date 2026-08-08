// -----------------------------------------------------------------------
// MODEL ROUTING
//
// Steps request a TIER, never a model name. That indirection is the main
// cost lever in the system: using one frontier model for every call is
// the default mistake, and most calls here are extraction, scoring, or
// classification, where a fast model is indistinguishable in quality and
// dramatically cheaper.
//
// Swapping providers or upgrading a model is a change to this file plus
// llm/client.js, and nothing else.
// -----------------------------------------------------------------------

export const TIERS = {
  // Classification, extraction, scoring, gate verdicts. The bulk of calls.
  fast: {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 4096,
    temperature: 0.2,
  },
  // Outlining, editing, revision - judgement, but bounded judgement.
  standard: {
    model: 'claude-sonnet-5',
    maxTokens: 16384,
    temperature: 0.6,
  },
  // Drafting body prose, and escalation retries when a lower tier fails.
  frontier: {
    model: 'claude-opus-5',
    maxTokens: 32768,
    temperature: 0.7,
  },
};

// When a tier's output fails validation twice, the call is retried one
// tier up. A model that keeps producing malformed structure usually
// stops when given more capability - and this is bounded, so it can't
// escalate indefinitely.
export const ESCALATION = {
  fast: 'standard',
  standard: 'frontier',
  frontier: null,
};

// USD per million tokens.
//
// ⚠ These are placeholders for budget arithmetic, NOT authoritative
// pricing. Check current rates at anthropic.com/pricing and correct them
// before relying on the cost caps for anything that matters. Getting them
// wrong makes the budget guard optimistic, which is the dangerous
// direction.
export const PRICING = {
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-opus-5': { input: 15.0, output: 75.0 },
};

export function resolveTier(tierName) {
  const tier = TIERS[tierName];
  if (!tier) throw new Error(`Unknown model tier "${tierName}". Known: ${Object.keys(TIERS).join(', ')}`);
  return tier;
}

export default { TIERS, ESCALATION, PRICING, resolveTier };
