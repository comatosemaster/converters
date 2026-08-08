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
import OpenAI from 'openai';
import { resolveTier } from '../../config/models.js';
import { priceCall } from './cost.js';
import { withRetry } from './retry.js';
import { ContractError, TransientError } from '../core/errors.js';

const clients = {};

const KEY_ENV = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

function getClient(provider) {
  if (clients[provider]) return clients[provider];

  const envName = KEY_ENV[provider];
  const apiKey = process.env[envName];
  if (!apiKey) {
    throw new ContractError(
      `${envName} is not set, but a model tier is configured to use ${provider}. Put it in a .env file at the repo root (see content-pipeline/.env.example), run with --mock to skip model calls entirely, or point that tier at a different provider in config/models.js.`,
      { provider, envName },
    );
  }

  clients[provider] = provider === 'openai' ? new OpenAI({ apiKey }) : new Anthropic({ apiKey });
  return clients[provider];
}

/** Which provider a given tier resolves to, accounting for --mock. */
export function activeProvider(tier = 'standard') {
  if (process.env.PIPELINE_MOCK_LLM === '1') return 'mock';
  return resolveTier(tier).provider;
}

/** Test seam: forget constructed clients (e.g. after changing a key). */
export function resetClients() {
  for (const key of Object.keys(clients)) delete clients[key];
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

  if (activeProvider(tier) === 'mock') {
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

  const call = config.provider === 'openai' ? callOpenAI : callAnthropic;
  const { text, inputTokens, outputTokens, stopReason } = await call({
    client: getClient(config.provider),
    model,
    config,
    system,
    user,
    schema,
    temperature,
    maxTokens,
    onRetry,
  });

  // Truncation is the failure most likely to be misread as "the model
  // can't follow a schema": the JSON is cut off mid-string, so it fails to
  // parse, and the repair loop then spends two more expensive attempts
  // getting cut off at exactly the same place.
  //
  // It matters more with reasoning models, where internal reasoning is
  // billed against the same output budget as the visible answer - so a
  // limit that looks generous for a 1500-word article can still be hit.
  if (stopReason === 'length' || stopReason === 'max_tokens') {
    throw new ContractError(
      `The model hit its output limit and the response was cut off (model: ${model}, limit: ${maxTokens ?? config.maxTokens} tokens). ` +
        `Raise maxTokens for the "${tier}" tier in config/models.js. With reasoning models the limit covers reasoning as well as the visible answer, so it needs considerable headroom.`,
      { model, tier, maxTokens: maxTokens ?? config.maxTokens, stopReason, outputTokens },
    );
  }

  if (!text.trim()) {
    // An empty reply usually means a refusal or a filtered response. Worth
    // surfacing rather than letting an empty artifact flow downstream, and
    // transient enough to be worth one more attempt.
    throw new TransientError('Model returned an empty response.', { stopReason, model });
  }

  return {
    text,
    model,
    inputTokens,
    outputTokens,
    costUsd: priceCall(model, inputTokens, outputTokens),
    latencyMs: Date.now() - startedAt,
    provider: config.provider,
    stopReason,
  };
}

// --- OpenAI ---------------------------------------------------------------

// OpenAI's parameter support varies by model generation: newer models
// require `max_completion_tokens` and reject `max_tokens`, and reasoning
// models accept only the default temperature. Rather than hardcoding a
// compatibility matrix that goes stale every release, the request adapts
// to whatever the API objects to.
//
// A 400 naming an unsupported parameter is information, not a failure -
// so it's read, the offending parameter is dropped or swapped, and the
// call is retried once. This is bounded (each parameter can only be
// adjusted once) so it cannot loop.
// Remembers which parameters a given model rejected, so the discovery
// round trip happens once per process instead of on every call. Without
// this, every single drafting call wastes ~1s and one request finding out
// the same thing again.
const unsupportedParams = new Map();

function rememberUnsupported(model, param) {
  if (!unsupportedParams.has(model)) unsupportedParams.set(model, new Set());
  unsupportedParams.get(model).add(param);
}

function isKnownUnsupported(model, param) {
  return unsupportedParams.get(model)?.has(param) ?? false;
}

function adaptRequest(request, message) {
  const text = String(message);

  if (/max_tokens.*not supported|Use 'max_completion_tokens'/i.test(text) && request.max_tokens !== undefined) {
    request.max_completion_tokens = request.max_tokens;
    delete request.max_tokens;
    return 'max_tokens → max_completion_tokens';
  }

  if (/max_completion_tokens/i.test(text) && /unsupported|unrecognized|unknown/i.test(text)) {
    request.max_tokens = request.max_completion_tokens;
    delete request.max_completion_tokens;
    return 'max_completion_tokens → max_tokens';
  }

  if (/temperature/i.test(text) && request.temperature !== undefined) {
    delete request.temperature;
    rememberUnsupported(request.model, 'temperature');
    return 'dropped temperature';
  }

  if (/response_format/i.test(text) && request.response_format !== undefined) {
    delete request.response_format;
    rememberUnsupported(request.model, 'response_format');
    return 'dropped response_format';
  }

  return null;
}

async function callOpenAI({ client, model, config, system, user, schema, temperature, maxTokens, onRetry }) {
  const request = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: maxTokens ?? config.maxTokens,
  };

  const wanted = temperature ?? config.temperature;
  if (
    config.supportsTemperature !== false &&
    wanted !== undefined &&
    !isKnownUnsupported(model, 'temperature')
  ) {
    request.temperature = wanted;
  }

  // JSON mode when a schema is expected. This removes the "returned prose
  // instead of JSON" failure entirely; shape is still checked by the
  // repair loop in structured.js, since json_object guarantees valid JSON
  // but not conformance to our schema.
  if (schema && !isKnownUnsupported(model, 'response_format')) {
    request.response_format = { type: 'json_object' };
  }

  let response;
  for (let attempt = 1; ; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop -- each attempt depends on the previous one's error
      response = await withRetry(() => client.chat.completions.create(request), { onRetry });
      break;
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      const adjusted = status === 400 ? adaptRequest(request, error?.message ?? '') : null;
      // Only parameter problems are adaptable, and only a few times.
      if (!adjusted || attempt > 3) throw error;
      onRetry?.({ attempt, delay: 0, error: new Error(`Adapting request (${adjusted})`) });
    }
  }

  const choice = response.choices?.[0];
  return {
    text: choice?.message?.content ?? '',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    stopReason: choice?.finish_reason,
  };
}

// --- Anthropic ------------------------------------------------------------

async function callAnthropic({ client, model, config, system, user, temperature, maxTokens, onRetry }) {
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

  return {
    text: response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(''),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    stopReason: response.stop_reason,
  };
}

// --- Model discovery ------------------------------------------------------
//
// Model ids go stale faster than any config file gets updated, so rather
// than trusting what's written in config/models.js, this asks the
// provider what your account can actually see.

export async function listAvailableModels(provider) {
  const client = getClient(provider);

  if (provider === 'openai') {
    const response = await client.models.list();
    return response.data.map((model) => model.id).sort();
  }

  const response = await client.models.list({ limit: 100 });
  return response.data.map((model) => model.id).sort();
}
