// -----------------------------------------------------------------------
// COST ACCOUNTING
//
// Every model call records what it cost. Without this, "why did last
// month cost that much?" is unanswerable, and the per-job budget cap has
// nothing to measure against.
// -----------------------------------------------------------------------

import { PRICING } from '../../config/models.js';

export function priceCall(model, inputTokens, outputTokens) {
  const rates = PRICING[model];
  // An unknown model prices at zero rather than throwing: failing a
  // content run because a pricing table wasn't updated would be a worse
  // outcome than under-reporting spend. The budget guard still works for
  // every model that IS priced.
  if (!rates) return 0;

  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

export function formatUsd(amount) {
  if (amount === 0) return '$0';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
