// -----------------------------------------------------------------------
// STRUCTURED OUTPUT  (retry layer 2 of 3 - see docs/architecture §8)
//
// Agents exchange JSON, never prose, so every boundary can be validated
// and every step tested with a fixture. This module is what makes that
// contract hold against a model that occasionally wraps JSON in a code
// fence or trails a comma.
//
// The escalation ladder is deliberately cheap-first:
//   1. Parse. Usually works.
//   2. Strip fences / extract the outermost JSON object, then parse.
//   3. jsonrepair - already a dependency of this repo, and free.
//   4. Re-ask the model, showing it the validation error. Models fix
//      their own schema violations reliably when shown what broke.
//   5. Re-ask one tier up.
//   6. Give up - OutputFormatError.
//
// Steps 1-3 cost nothing. Only 4 and 5 spend money, and they're capped,
// so a persistently malformed response costs three calls rather than
// looping forever.
// -----------------------------------------------------------------------

import { jsonrepair } from 'jsonrepair';
import { complete } from './client.js';
import { validate } from '../core/validate.js';
import { OutputFormatError } from '../core/errors.js';
import { ESCALATION } from '../../config/models.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// A second Ajv instance for inline (non-registered) schemas - the shared
// one in core/validate.js only knows schemas loaded from schemas/.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Salvage for when a model wraps its JSON in a ```json fence or adds a
// sentence of preamble.
//
// ⚠ This must only ever run on text that has ALREADY failed to parse as
// JSON. Our articles are about code, so their bodies are full of ```
// fences - and those fences live INSIDE a JSON string value. Running this
// first would match a fence in the article body and extract a code sample
// instead of the response, corrupting output that was perfectly valid.
// (That is not hypothetical: it silently discarded three good drafts.)
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  const firstBrace = candidate.search(/[{[]/);
  if (firstBrace === -1) return candidate;

  const lastBrace = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  return lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate.slice(firstBrace);
}

// Ordered cheapest-and-safest first. Each step is only reached because
// the previous one failed, so a well-behaved response never touches the
// salvage paths at all.
function tryParse(text) {
  // 1. The response as-is. JSON mode means this is the normal case.
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    /* fall through */
  }

  // 2. Repair the raw text - trailing commas, smart quotes, and similar.
  try {
    return { ok: true, value: JSON.parse(jsonrepair(text)), repaired: true };
  } catch {
    /* fall through */
  }

  // 3. Only now assume the JSON is wrapped in prose or a fence.
  const extracted = extractJson(text);
  try {
    return { ok: true, value: JSON.parse(extracted), extracted: true };
  } catch {
    /* fall through */
  }

  // 4. Both salvage techniques at once.
  try {
    return { ok: true, value: JSON.parse(jsonrepair(extracted)), repaired: true, extracted: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function validateAgainst(schema, value, schemaId) {
  if (schemaId) return validate(schemaId, value);

  const check = ajv.compile(schema);
  const ok = check(value);
  return {
    ok,
    errors: ok
      ? []
      : check.errors.map((error) => ({
          field: error.instancePath || '(root)',
          message: `${error.instancePath || 'value'} ${error.message}`,
        })),
  };
}

/**
 * A model call that must return JSON matching a schema.
 *
 * @returns {{ value, meta }} - meta carries model/tokens/cost for the event log.
 */
export async function completeStructured({
  tier = 'standard',
  system,
  user,
  schema,
  schemaId,
  temperature,
  maxTokens,
  onRetry,
  onAttempt,
}) {
  const attempts = [];
  let currentTier = tier;
  let currentUser = user;
  // Kept so a total failure can report WHY rather than just "3 attempts
  // failed". Without this the raw output is discarded and the only way to
  // diagnose is to reproduce the call by hand.
  let lastText = '';
  let lastErrors = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    // eslint-disable-next-line no-await-in-loop -- each attempt depends on the previous one's error
    const response = await complete({
      tier: currentTier,
      system,
      user: currentUser,
      schema,
      temperature,
      maxTokens,
      onRetry,
    });

    attempts.push({
      attempt,
      tier: currentTier,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUsd: response.costUsd,
      latencyMs: response.latencyMs,
    });
    onAttempt?.(attempts[attempts.length - 1]);

    lastText = response.text;
    const parsed = tryParse(response.text);

    if (parsed.ok) {
      // eslint-disable-next-line no-await-in-loop -- validation is part of this attempt
      const { ok, errors } = await validateAgainst(schema, parsed.value, schemaId);
      if (ok) {
        return {
          value: parsed.value,
          meta: {
            attempts,
            model: response.model,
            provider: response.provider,
            repaired: Boolean(parsed.repaired),
            costUsd: attempts.reduce((sum, item) => sum + item.costUsd, 0),
            inputTokens: attempts.reduce((sum, item) => sum + item.inputTokens, 0),
            outputTokens: attempts.reduce((sum, item) => sum + item.outputTokens, 0),
          },
        };
      }

      lastErrors = errors;

      // Valid JSON, wrong shape. Show the model exactly what failed -
      // this is what it needs to fix it, and it usually does on the first
      // correction.
      currentUser = [
        user,
        '',
        '---',
        'Your previous response was valid JSON but did not match the required schema:',
        ...errors.map((error) => `- ${error.message}`),
        '',
        'Return corrected JSON only. No prose, no code fence.',
      ].join('\n');
    } else {
      lastErrors = [{ field: '(root)', message: `Not parseable as JSON: ${parsed.error}` }];
      currentUser = [
        user,
        '',
        '---',
        `Your previous response could not be parsed as JSON (${parsed.error}).`,
        'Return valid JSON only. No prose, no code fence.',
      ].join('\n');
    }

    // Last correction attempt goes one tier up, in case the current tier
    // simply can't hold this structure reliably.
    if (attempt === 2) currentTier = ESCALATION[currentTier] ?? currentTier;
  }

  throw new OutputFormatError(
    [
      `Model did not return schema-valid JSON after ${attempts.length} attempts (tiers: ${attempts.map((a) => a.tier).join(' → ')}).`,
      '',
      'Last validation errors:',
      ...lastErrors.slice(0, 6).map((error) => `  - ${error.message}`),
      '',
      `Response was ${lastText.length} characters. First 300:`,
      `  ${lastText.slice(0, 300).replace(/\n/g, ' ')}`,
    ].join('\n'),
    { attempts, lastErrors, lastText },
  );
}
