// -----------------------------------------------------------------------
// SCHEMA VALIDATION
//
// One shared Ajv instance, with every schema in schemas/ compiled once at
// startup. Artifacts are validated on write, so a schema violation is
// caught at the boundary that produced it rather than three steps
// downstream where the cause is no longer obvious.
// -----------------------------------------------------------------------

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { PIPELINE_ROOT } from '../../config/pipeline.config.js';
import { ValidationError } from './errors.js';

const SCHEMA_DIR = path.join(PIPELINE_ROOT, 'schemas');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

let ready = null;

async function loadSchemas() {
  const files = (await readdir(SCHEMA_DIR)).filter((file) => file.endsWith('.schema.json'));
  for (const file of files) {
    const schema = JSON.parse(await readFile(path.join(SCHEMA_DIR, file), 'utf8'));
    if (!ajv.getSchema(schema.$id ?? file)) ajv.addSchema(schema, schema.$id ?? file);
  }
}

export async function initValidators() {
  if (!ready) ready = loadSchemas();
  return ready;
}

// Formats Ajv's errors into something a human can act on without knowing
// what a JSON Pointer is.
export function formatErrors(errors) {
  return (errors ?? []).map((error) => {
    const field = error.instancePath ? error.instancePath.replace(/^\//, '').replace(/\//g, '.') : '(root)';
    if (error.keyword === 'additionalProperties') {
      return { field, message: `Unknown field "${error.params.additionalProperty}".` };
    }
    if (error.keyword === 'required') {
      return { field, message: `Missing required field "${error.params.missingProperty}".` };
    }
    return { field, message: `${field} ${error.message}.` };
  });
}

export async function validate(schemaId, value) {
  await initValidators();
  const validator = ajv.getSchema(schemaId);
  if (!validator) throw new ValidationError(`No schema registered with id "${schemaId}".`, { schemaId });

  const ok = validator(value);
  return { ok, errors: ok ? [] : formatErrors(validator.errors) };
}

// Throwing variant, for artifacts a step is about to persist. A step
// producing an invalid artifact is a bug in that step, so it fails loudly
// rather than writing something the next step can't read.
export async function assertValid(schemaId, value, context = {}) {
  const { ok, errors } = await validate(schemaId, value);
  if (!ok) {
    throw new ValidationError(
      `Value failed schema "${schemaId}": ${errors.map((error) => error.message).join(' ')}`,
      { schemaId, errors, ...context },
    );
  }
  return value;
}
