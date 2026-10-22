import { CORE_SCHEMA, dump, loadAll, mergeTag } from 'js-yaml';

// -----------------------------------------------------------------------
// YAML <-> JSON conversion logic - no UI here, built on js-yaml.
//
// Parsing uses the YAML 1.2 core schema, which is what modern tools
// (Kubernetes, GitHub Actions, OpenAPI) follow: `no`, `yes`, `on` and
// `off` stay strings instead of turning into booleans (the infamous
// "Norway problem", where the country code NO became `false`), and dates
// stay as written instead of becoming timestamps. Merge keys (`<<: *base`)
// are enabled on top because docker-compose and CI files use them a lot.
// -----------------------------------------------------------------------

const SCHEMA = CORE_SCHEMA.withTags(mergeTag);

export const EXAMPLE_YAML = `# A small app config
app:
  name: neatsize-demo
  version: 2.4.0
  debug: false
  country: NO          # stays the string "NO" in YAML 1.2

defaults: &defaults
  retries: 3
  timeout: 30

services:
  web:
    <<: *defaults
    port: 8080
    hosts:
      - example.com
      - www.example.com
  worker:
    <<: *defaults
    timeout: 120

description: |
  Multi-line text keeps
  its line breaks.
`;

export const EXAMPLE_JSON = `{
  "name": "neatsize-demo",
  "version": "2.4.0",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build" },
  "keywords": ["tools", "converter"],
  "engines": { "node": ">=20" },
  "notes": "Line one\\nLine two"
}`;

// Finds values JSON can't represent faithfully, so the user is told
// instead of getting a silently different document.
function inspectValues(value, found = { nonFinite: false, unsafeInt: false }, depth = 0) {
  if (depth > 200) return found;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) found.nonFinite = true;
    else if (Number.isInteger(value) && !Number.isSafeInteger(value)) found.unsafeInt = true;
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((inner) => inspectValues(inner, found, depth + 1));
  }
  return found;
}

/**
 * YAML text -> { ok, json, documents, warnings } or { ok: false, error, line, column }.
 * options: { indent: '2' | '4' | 'tab' | '0', multiDoc: 'array' | 'first' }
 */
export function yamlToJson(text, options) {
  let documents;
  try {
    documents = loadAll(text, { schema: SCHEMA });
  } catch (error) {
    // js-yaml's mark is 0-based; people count lines from 1.
    return {
      ok: false,
      error: error.reason ? capitalize(error.reason) : String(error.message || error),
      line: error.mark ? error.mark.line + 1 : null,
      column: error.mark ? error.mark.column + 1 : null,
    };
  }
  if (documents.length === 0) {
    return { ok: false, error: 'There is no YAML content here yet - only comments or blank lines.' };
  }

  const warnings = [];
  let data = documents[0];
  if (documents.length > 1) {
    if (options.multiDoc === 'array') {
      data = documents;
      warnings.push(`This file holds ${documents.length} YAML documents (separated by ---), so the JSON is an array with one item per document.`);
    } else {
      warnings.push(`This file holds ${documents.length} YAML documents (separated by ---); only the first was converted.`);
    }
  }

  const found = inspectValues(data);
  if (found.nonFinite) warnings.push('.inf / .nan values have no JSON equivalent and were written as null.');
  if (found.unsafeInt) {
    warnings.push('Some whole numbers are too large for JSON parsers to store exactly and may have lost their last digits. Quote them in the YAML to keep them as text.');
  }
  // Whole-line comments only: a "#" inside a quoted value isn't a comment,
  // and telling those apart properly would need a second parse.
  if (/^\s*#/m.test(text)) warnings.push('YAML comments were dropped - JSON has no comment syntax.');

  const indent = options.indent === 'tab' ? '\t' : Number(options.indent);
  // JSON.stringify(undefined) is undefined - an empty document ("---" on
  // its own) is null in YAML, so show that rather than nothing.
  return { ok: true, json: JSON.stringify(data ?? null, null, indent || undefined), documents: documents.length, warnings };
}

/**
 * Parsed JSON value -> { ok, yaml } or { ok: false, error }.
 * options: { indent: '2' | '4', sortKeys, wrap }
 */
export function jsonToYaml(value, options) {
  try {
    const yaml = dump(value, {
      indent: Number(options.indent),
      sortKeys: options.sortKeys,
      // -1 = never fold long strings onto several lines.
      lineWidth: options.wrap ? 80 : -1,
      noRefs: true,
    });
    const warnings = inspectValues(value).unsafeInt
      ? ['Some whole numbers are too large to be read exactly from JSON and may have lost their last digits. Put them in quotes in the JSON to keep them as text.']
      : [];
    return { ok: true, yaml, warnings };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
