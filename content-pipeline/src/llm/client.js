// -----------------------------------------------------------------------
// THE PROVIDER SEAM
//
// ★ The ONLY module that knows which AI provider we use. Steps and agents
//   call `complete()` with a tier and messages; they never see an SDK
//   type. Switching provider is a change to this file and config/models.js.
//
// Two providers are implemented:
//   - anthropic : the real one.
//   - mock      : returns deterministic, schema-shaped output with no
//                 network call. Not a testing afterthought - it makes the
//                 whole pipeline runnable in CI, and lets the plumbing
//                 (prompts, validation, retries, state transitions, cost
//                 accounting) be exercised without spending money on every
//                 change to an unrelated step.
// -----------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';
import { resolveTier } from '../../config/models.js';
import { priceCall } from './cost.js';
import { withRetry } from './retry.js';
import { ContractError, TransientError } from '../core/errors.js';

let anthropicClient = null;

function getAnthropic() {
  if (anthropicClient) return anthropicClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ContractError(
      'ANTHROPIC_API_KEY is not set. Put it in a .env file at the repo root (see content-pipeline/.env.example), or run with --mock to exercise the pipeline without calling a model.',
    );
  }

  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

export function activeProvider() {
  if (process.env.PIPELINE_MOCK_LLM === '1') return 'mock';
  return 'anthropic';
}

// --- Mock provider --------------------------------------------------------
//
// Produces output that satisfies the caller's schema, so downstream
// validation exercises the real code path rather than being bypassed.
// Deterministic (seeded off the prompt) so repeated runs are comparable.

// Kebab-case ids (slugs, tool ids, category ids) - by far the most
// common pattern in these schemas.
const KEBAB_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';

function kebab(text, maxWords = 6) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .split('-')
      .filter(Boolean)
      .slice(0, maxWords)
      .join('-') || 'mock-value'
  );
}

function mockText(schema, promptText, context) {
  // No schema means a prose response is expected.
  if (!schema) {
    return 'Mock response. Set ANTHROPIC_API_KEY and drop --mock for real output.';
  }

  const topicMatch = promptText.match(/TOPIC:\s*(.+)/);
  const topic = topicMatch ? topicMatch[1].trim() : 'A Mock Topic';

  // Real ids pulled out of the prompt, so mock output passes the links
  // and frontmatter gates the same way real output would. A mock that
  // can't get through the gates would only ever test the failure path.
  const toolId = context.toolIds[0] ?? 'base64-encoder-decoder';
  const categoryId = context.categoryIds[0] ?? 'text-data';

  const build = (node, key = '', index = 0) => {
    if (node.type === 'object') {
      const result = {};
      for (const child of node.required ?? Object.keys(node.properties ?? {})) {
        const spec = node.properties?.[child];
        if (spec) result[child] = build(spec, child);
      }
      return result;
    }

    if (node.type === 'array') {
      const item = node.items ?? { type: 'string' };
      const count = Math.min(Math.max(node.minItems ?? 2, 2), node.maxItems ?? 99);
      // `index` is threaded through so uniqueItems is satisfiable -
      // otherwise every element is identical and validation fails on a
      // constraint that has nothing to do with what's being tested.
      return Array.from({ length: count }, (_, i) => build(item, key, i));
    }

    if (node.type === 'integer' || node.type === 'number') return node.minimum ?? 1;
    if (node.type === 'boolean') return false;
    if (node.enum) return node.enum[0];

    // --- Strings ---------------------------------------------------------
    if (node.format === 'date') return new Date().toISOString().slice(0, 10);

    // Keyed off field NAME, not just pattern: draft.schema.json leaves
    // `category` unconstrained (the gate checks it against the live
    // registry instead), so pattern alone isn't enough to know that a
    // real id is required here.
    if (/^categor/i.test(key)) return categoryId;
    if (/tool/i.test(key)) return context.toolIds[index % Math.max(context.toolIds.length, 1)] ?? toolId;
    if (/^slug$/i.test(key)) return kebab(topic);
    if (/^tags?$/i.test(key)) return `${kebab(topic, 2)}-${index}`;

    if (node.pattern === KEBAB_PATTERN) return kebab(topic);

    // The article body needs to clear the markdown gate's real
    // thresholds (word count, section headings, an internal link), or
    // the mock could only ever exercise the failure path.
    if (key === 'body') return mockBody(topic, toolId);

    const min = node.minLength ?? 0;
    let value = `Mock content about ${topic}.`;
    while (value.length < min) {
      value += ` Additional mock text about ${topic} so this field satisfies its minimum length.`;
    }
    return node.maxLength ? value.slice(0, node.maxLength) : value;
  };

  return JSON.stringify(build(schema));
}

// A structurally valid article: enough words, real headings, one internal
// link. Intentionally dull - it exists to exercise the gates, not to read
// well.
function mockBody(topic, toolId) {
  // Vocabulary is deliberately varied. An earlier version repeated one
  // word in every paragraph and tripped the keyword-stuffing check -
  // which was the gate working correctly, but it meant the mock could
  // never demonstrate a passing article.
  const openers = [
    'The behaviour here is straightforward once the underlying constraint is clear.',
    'A second consideration matters more than most introductions admit.',
    'Practical use tends to diverge from the textbook description.',
    'Tradeoffs become visible as soon as volume increases.',
    'Edge cases are where most confusion originates.',
    'Performance characteristics shift depending on input size.',
    'Tooling choices influence how painful the failure modes feel.',
    'Compatibility concerns are worth checking before committing.',
    'A short recap helps before moving on.',
  ];
  const middles = [
    'Concrete numbers make the difference easier to reason about than adjectives do.',
    'Readers arriving mid-task usually want the constraint stated plainly.',
    'Describing what goes wrong is more useful than listing what goes right.',
    'Small inputs hide costs that larger ones expose immediately.',
  ];

  const paragraph = (n) =>
    `${openers[(n - 1) % openers.length]} ${middles[(n - 1) % middles.length]} ` +
    `Placeholder prose stands in for a real explanation of ${topic}, with sentences of varying length so readability ` +
    'scoring has something reasonable to measure. None of this is genuine guidance and it must never reach a live site.';

  return [
    `Placeholder introduction covering ${topic}. The opening states the practical answer before explaining the detail behind it.`,
    '',
    '## How it works',
    '',
    paragraph(1),
    '',
    paragraph(2),
    '',
    '## When it helps',
    '',
    paragraph(3),
    '',
    `You can try this with the [linked tool](/tool/${toolId}), which runs entirely in the browser.`,
    '',
    paragraph(4),
    '',
    '## When to avoid it',
    '',
    paragraph(5),
    '',
    paragraph(6),
    '',
    '## Common mistakes',
    '',
    paragraph(7),
    '',
    paragraph(8),
    '',
    '## Summary',
    '',
    paragraph(9),
  ].join('\n');
}

// The prompt already contains the real tool and category ids (they're
// injected as grounding context). Reading them back out means the mock
// produces output that references things that genuinely exist.
function extractIds(promptText) {
  const ids = [...promptText.matchAll(/"id":\s*"([a-z0-9-]+)"/g)].map((match) => match[1]);
  const categoryIds = ['graphics-media', 'text-data', 'business-finance', 'developer', 'everyday', 'fun'].filter((id) =>
    ids.includes(id),
  );
  return {
    toolIds: ids.filter((id) => !categoryIds.includes(id)),
    categoryIds,
  };
}

// --- Public API -----------------------------------------------------------

/**
 * One model call.
 *
 * @param {object}   options
 * @param {string}   options.tier      - "fast" | "standard" | "frontier"
 * @param {string}   options.system    - system prompt
 * @param {string}   options.user      - user message
 * @param {object}   [options.schema]  - JSON Schema the reply must satisfy
 * @param {number}   [options.temperature]
 * @param {function} [options.onRetry]
 * @returns {{ text, model, inputTokens, outputTokens, costUsd, latencyMs, provider }}
 */
export async function complete({ tier = 'standard', system, user, schema, temperature, maxTokens, onRetry }) {
  const config = resolveTier(tier);
  const model = config.model;
  const startedAt = Date.now();

  if (activeProvider() === 'mock') {
    const prompt = `${system}\n${user}`;
    const text = mockText(schema, prompt, extractIds(prompt));
    return {
      text,
      model: `mock:${model}`,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - startedAt,
      provider: 'mock',
    };
  }

  const client = getAnthropic();

  const response = await withRetry(
    () =>
      client.messages.create({
        model,
        max_tokens: maxTokens ?? config.maxTokens,
        temperature: temperature ?? config.temperature,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    { onRetry },
  );

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!text.trim()) {
    // An empty reply is usually a truncation or a refusal; both are worth
    // surfacing rather than letting an empty artifact flow downstream.
    throw new TransientError('Model returned an empty response.', { stopReason: response.stop_reason });
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  return {
    text,
    model,
    inputTokens,
    outputTokens,
    costUsd: priceCall(model, inputTokens, outputTokens),
    latencyMs: Date.now() - startedAt,
    provider: 'anthropic',
    stopReason: response.stop_reason,
  };
}
