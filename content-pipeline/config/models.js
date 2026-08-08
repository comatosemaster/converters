// -----------------------------------------------------------------------
// MODEL ROUTING
//
// Steps request a TIER, never a model name. That indirection is the main
// cost lever in the system: using one flagship model for every call is
// the default mistake, and most calls here are extraction, scoring, or
// classification, where a small model is indistinguishable in quality and
// dramatically cheaper.
//
// `provider` is per-tier, so you can mix: the expensive drafting call on
// one provider, the cheap structural calls on another. Everything
// defaults to OpenAI.
//
// ⚠ VERIFY THE MODEL IDS. They are correct as of early 2026, but model
//   names change often. Run `npm run pipeline -- models` to list what
//   your account can actually see, then correct anything stale here.
// -----------------------------------------------------------------------

export const TIERS = {
  // Classification, extraction, scoring, gate verdicts. Cheapest thing
  // that can follow a schema.
  fast: {
    provider: 'openai',
    model: 'gpt-5.4-nano',
    maxTokens: 8192,
    temperature: 0.2,
  },

  // Outlining and revision. Real judgement, but bounded and well-specified
  // by the prompt, so the mid-size model is the right value here.
  standard: {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    maxTokens: 16384,
    temperature: 0.6,
  },

  // Drafting body prose. The one place model capability is directly
  // visible in the output, and the only call worth paying flagship prices
  // for - it runs once per article.
  //
  // Newer models exist (gpt-5.5-pro, and the gpt-5.6-luna/sol/terra line,
  // whose naming suggests variants rather than a straight upgrade). If you
  // know what those are, this is the line to change - `pipeline models`
  // lists everything your account can see.
  frontier: {
    provider: 'openai',
    model: 'gpt-5.5',
    maxTokens: 32768,
    temperature: 0.8,
  },
};

// Anthropic equivalents, kept working because the provider seam was built
// for exactly this. To use them, change a tier's `provider` to
// 'anthropic' and its `model` to one of these.
export const ANTHROPIC_MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  standard: 'claude-sonnet-5',
  frontier: 'claude-opus-5',
};

// When a tier's output fails validation twice, the call is retried one
// tier up. A model that keeps producing malformed structure usually
// stops when given more capability - and this is bounded, so it cannot
// escalate indefinitely.
export const ESCALATION = {
  fast: 'standard',
  standard: 'frontier',
  frontier: null,
};

// USD per million tokens.
//
// ⚠ These are placeholders for budget arithmetic, NOT authoritative
// pricing. Check current rates (openai.com/api/pricing) and correct them
// before relying on the cost caps for anything that matters. Getting them
// wrong makes the budget guard optimistic, which is the dangerous
// direction.
export const PRICING = {
  // ⚠ The gpt-5.4 / 5.5 rates below are GUESSES, carried over from the
  // gpt-5 generation. They are almost certainly wrong. A model with no
  // entry here is charged at a deliberately high fallback rate (see
  // llm/cost.js) so the budget cap still bites - but for accurate numbers,
  // replace these with the real published rates.
  'gpt-5.5': { input: 1.25, output: 10.0 },
  'gpt-5.4-mini': { input: 0.25, output: 2.0 },
  'gpt-5.4-nano': { input: 0.05, output: 0.4 },
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-opus-5': { input: 15.0, output: 75.0 },
};

export function resolveTier(tierName) {
  const tier = TIERS[tierName];
  if (!tier) throw new Error(`Unknown model tier "${tierName}". Known: ${Object.keys(TIERS).join(', ')}`);
  return tier;
}

/** Distinct providers actually in use - so `doctor` only demands the keys you need. */
export function providersInUse() {
  return [...new Set(Object.values(TIERS).map((tier) => tier.provider))];
}

export default { TIERS, ESCALATION, PRICING, ANTHROPIC_MODELS, resolveTier, providersInUse };
