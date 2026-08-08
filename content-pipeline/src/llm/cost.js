// -----------------------------------------------------------------------
// COST ACCOUNTING
//
// Every model call records what it cost. Without this, "why did last
// month cost that much?" is unanswerable, and the per-job budget cap has
// nothing to measure against.
// -----------------------------------------------------------------------

import { PRICING } from '../../config/models.js';

// Used when a model isn't in the pricing table. Deliberately expensive:
// an unpriced model must not read as free.
//
// Pricing at zero would silently disable the budget cap - the guard would
// keep reporting $0 spent and never trigger, which is the one failure
// direction that actually costs money. Over-estimating instead means an
// unpriced model trips the cap early and visibly, which is a fixable
// annoyance rather than a surprise invoice.
const UNKNOWN_MODEL_RATES = { input: 20.0, output: 100.0 };

const warnedFor = new Set();

export function priceCall(model, inputTokens, outputTokens) {
  let rates = PRICING[model];

  if (!rates) {
    rates = UNKNOWN_MODEL_RATES;
    if (!warnedFor.has(model)) {
      warnedFor.add(model);
      console.warn(
        `[cost] No pricing for "${model}" - assuming a high rate so the budget cap still bites. Add it to config/models.js PRICING for accurate numbers.`,
      );
    }
  }

  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

export function formatUsd(amount) {
  if (amount === 0) return '$0';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
