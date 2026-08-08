// -----------------------------------------------------------------------
// PROMPT LOADER
//
// Prompts are versioned files under prompts/<agent>/v<N>.md, never string
// literals in code. Three reasons that matters:
//
//   - The version used is recorded in each job's event log, so a quality
//     regression is bisectable instead of a mystery.
//   - v2 is a NEW file; v1 stays. Rolling back is changing a number.
//   - Prompt edits stop being code changes, so tuning tone doesn't mean
//     touching a step and re-testing its logic.
//
// Each file carries a small YAML header (same convention as the blog's
// own frontmatter, reusing the same parser) declaring the model tier,
// temperature, and which schema the reply must satisfy.
// -----------------------------------------------------------------------

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PIPELINE_ROOT } from '../../config/pipeline.config.js';
import { parseFrontmatter } from '../adapters/site.js';
import { ContractError } from '../core/errors.js';

const PROMPT_DIR = path.join(PIPELINE_ROOT, 'prompts');

const cache = new Map();

async function latestVersion(agentId) {
  const dir = path.join(PROMPT_DIR, agentId);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    throw new ContractError(`No prompts directory for agent "${agentId}" (looked in ${dir}).`, { agentId });
  }

  const versions = files
    .map((file) => file.match(/^v(\d+)\.md$/))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => b - a);

  if (versions.length === 0) {
    throw new ContractError(`No version files (vN.md) found for agent "${agentId}".`, { agentId });
  }
  return versions[0];
}

/**
 * Loads a prompt.
 *
 * @param agentId  directory under prompts/
 * @param version  specific version, or omit for the newest
 * @returns { id, version, tier, temperature, schemaId, system, raw }
 */
export async function loadPrompt(agentId, version) {
  const resolved = version ?? (await latestVersion(agentId));
  const cacheKey = `${agentId}@${resolved}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const file = path.join(PROMPT_DIR, agentId, `v${resolved}.md`);
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new ContractError(`Prompt not found: ${file}`, { agentId, version: resolved });
  }

  const { data, body } = parseFrontmatter(raw);

  const system = body.trim();

  // A declared input that never appears as a placeholder means the agent
  // computes context the prompt silently ignores.
  //
  // This is not hypothetical: the first version of the outliner prompt
  // declared `topic` and never interpolated it, so the model was asked to
  // outline an article with no subject and simply invented one. Nothing
  // failed - it just produced confidently wrong output. Cheap to detect,
  // nearly impossible to notice by reading.
  const declared = Array.isArray(data.inputs) ? data.inputs : [];
  const missing = declared.filter((input) => !system.includes(`{{${input}}}`));
  if (missing.length > 0) {
    throw new ContractError(
      `Prompt ${agentId}/v${resolved} declares input(s) [${missing.join(', ')}] that never appear as {{placeholders}} in the template. Either use them or remove them from the frontmatter.`,
      { agentId, version: resolved, missing },
    );
  }

  const prompt = {
    id: data.id ?? agentId,
    version: `v${resolved}`,
    tier: data.tier ?? 'standard',
    temperature: data.temperature !== undefined ? Number(data.temperature) : undefined,
    maxTokens: data.maxTokens !== undefined ? Number(data.maxTokens) : undefined,
    schemaId: data.outputSchema || null,
    inputs: declared,
    system,
  };

  cache.set(cacheKey, prompt);
  return prompt;
}

// Replaces {{name}} placeholders. Objects are JSON-stringified so a
// prompt can embed structured context (the tool registry, an outline)
// without every caller hand-formatting it.
//
// The reverse of the loader's check: a placeholder with no value would
// otherwise reach the model as the literal text "{{topic}}", which reads
// as an instruction to the model and produces baffling output.
export function render(template, variables = {}) {
  const unresolved = [];

  const rendered = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in variables) || variables[key] === undefined || variables[key] === null) {
      unresolved.push(key);
      return match;
    }
    const value = variables[key];
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  });

  if (unresolved.length > 0) {
    throw new ContractError(
      `Prompt has unresolved placeholder(s): ${[...new Set(unresolved)].map((key) => `{{${key}}}`).join(', ')}. The step must supply a value for each.`,
      { unresolved: [...new Set(unresolved)] },
    );
  }

  return rendered;
}

/** Test seam / long-running processes: forget cached prompts. */
export function clearPromptCache() {
  cache.clear();
}
