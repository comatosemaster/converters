// -----------------------------------------------------------------------
// AGENT RUNNER
//
// The shared wrapper every LLM-backed step goes through. It exists so
// that budget checking, cost accounting, event logging, and prompt
// version recording happen for EVERY agent by construction, rather than
// being four things each new step has to remember.
//
// The alternative - each step calling completeStructured() directly - is
// how you end up with one agent that forgets to record its cost, and an
// unexplained gap in the spend report three months later.
// -----------------------------------------------------------------------

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPrompt, render } from '../prompt/loader.js';
import { completeStructured } from './structured.js';
import { assertWithinBudget, chargeJob } from '../core/budget.js';
import { EVENTS, appendEvent } from '../core/events.js';
import { saveJob } from '../core/job.js';
import { getSchemaObject } from '../core/validate.js';
import { writeArtifact } from '../core/store.js';
import { PIPELINE_ROOT } from '../../config/pipeline.config.js';
import { readRegistry, readAllArticles } from '../adapters/site.js';

let houseStyleCache = null;

async function houseStyle() {
  if (houseStyleCache) return houseStyleCache;
  houseStyleCache = await readFile(path.join(PIPELINE_ROOT, 'config', 'house-style.md'), 'utf8');
  // Strip the explanatory HTML comment at the top - it's guidance for
  // whoever edits the file, not for the model.
  houseStyleCache = houseStyleCache.replace(/^<!--[\s\S]*?-->\s*/, '').trim();
  return houseStyleCache;
}

/**
 * Context every content agent gets, whether it asks for it or not.
 *
 * The tool list is the important part: it's the grounding that makes
 * this site's articles defensible rather than interchangeable, and it's
 * what stops a model inventing tools that don't exist. Passing it always
 * costs a few hundred tokens and removes the most common failure mode.
 */
export async function buildAgentContext() {
  const [registry, articles, style] = await Promise.all([readRegistry(), readAllArticles(), houseStyle()]);

  return {
    houseStyle: style,
    tools: registry.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      category: tool.category,
      description: tool.description,
    })),
    categories: registry.categories.map((category) => ({ id: category.id, name: category.name })),
    existingArticles: articles.map((article) => ({
      slug: article.slug,
      title: article.frontmatter.title,
      category: article.frontmatter.category,
    })),
  };
}

/**
 * Runs one agent: load its versioned prompt, render variables into it,
 * call the model with schema enforcement, account for the cost, log it.
 *
 * @returns {{ value, meta }}
 */
export async function runAgent({ agentId, job, variables, promptVersion, tierOverride }) {
  const prompt = await loadPrompt(agentId, promptVersion);

  assertWithinBudget(job, { about: agentId });

  // The schema is injected into the prompt from the same file the
  // validator reads, so the model is told exactly what it will be judged
  // against. Describing a schema in prose inside a prompt guarantees the
  // two drift apart, and then output fails validation for rules the model
  // was never shown.
  const schema = prompt.schemaId ? await getSchemaObject(prompt.schemaId) : null;

  const system = render(prompt.system, { ...variables, schema });

  await EVENTS.stepStarted(job.id, {
    step: agentId,
    prompt: `${prompt.id}@${prompt.version}`,
    tier: tierOverride ?? prompt.tier,
  });

  let result;
  try {
    result = await completeStructured({
      tier: tierOverride ?? prompt.tier,
      system,
      schema,
      // The system prompt carries the instructions and all context; the
      // user turn is only the trigger. Keeping them separate means prompt
      // caching can apply to the large, stable part.
      user: 'Produce the output now, as JSON only.',
      schemaId: prompt.schemaId,
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens,
      onRetry: ({ attempt, delay, error }) =>
        appendEvent(job.id, 'llm.retry', { agentId, attempt, delay, error: error.message }),
    });
  } catch (error) {
    // Persist whatever the model actually said before rethrowing. A
    // failure you can't inspect afterwards is one you debug by re-running
    // an expensive call and hoping it fails the same way.
    if (error.details?.lastText) {
      await writeArtifact(job.id, `failed-${agentId}.txt`, error.details.lastText);
      await appendEvent(job.id, 'llm.failed', {
        agent: agentId,
        errors: error.details.lastErrors,
        savedAs: `failed-${agentId}.txt`,
      });
    }
    throw error;
  }

  chargeJob(job, result.meta.costUsd);
  await saveJob(job);

  await EVENTS.llmCall(job.id, {
    agent: agentId,
    prompt: `${prompt.id}@${prompt.version}`,
    model: result.meta.model,
    provider: result.meta.provider,
    attempts: result.meta.attempts.length,
    repaired: result.meta.repaired,
    inputTokens: result.meta.inputTokens,
    outputTokens: result.meta.outputTokens,
    costUsd: result.meta.costUsd,
  });

  return { ...result, prompt };
}
