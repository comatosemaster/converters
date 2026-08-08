// -----------------------------------------------------------------------
// READING THE TOOL REGISTRY FROM NODE
//
// src/tools/registry.js cannot simply be imported by a build script: it
// pulls in lucide-react and ~30 .jsx components, none of which plain Node
// can load.
//
// It is, however, syntactically ordinary ESM - the .jsx files are only
// referenced by import path, never with JSX syntax in the file itself. So
// acorn parses it cleanly and the string-literal fields can be read
// straight off the AST.
//
// Parsing the AST rather than regex-matching matters: a missed tool id
// would silently drop a page from the sitemap, which is exactly the kind
// of bug nobody notices for months.
//
// This is the single implementation - content-pipeline's site adapter
// imports it from here rather than keeping its own copy.
// -----------------------------------------------------------------------

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');
export const REGISTRY_FILE = path.join(REPO_ROOT, 'src', 'tools', 'registry.js');

function literalValue(node) {
  if (!node) return undefined;
  if (node.type === 'Literal') return node.value;
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1) return node.quasis[0].value.cooked;
  if (node.type === 'ArrayExpression') {
    return node.elements.map((element) => literalValue(element)).filter((value) => value !== undefined);
  }
  return undefined;
}

function objectToRecord(node) {
  const record = {};
  for (const property of node.properties) {
    if (property.type !== 'Property') continue;
    const key = property.key.name ?? property.key.value;
    const value = literalValue(property.value);
    // Component and icon references are identifiers, not literals, so they
    // come back undefined and are skipped - which is correct here, since
    // no build script has any use for them.
    if (value !== undefined) record[key] = value;
  }
  return record;
}

function extractExportedArray(ast, name) {
  for (const node of ast.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue;
    if (node.declaration.type !== 'VariableDeclaration') continue;

    for (const declarator of node.declaration.declarations) {
      if (declarator.id.name !== name) continue;
      if (declarator.init?.type !== 'ArrayExpression') continue;
      return declarator.init.elements
        .filter((element) => element?.type === 'ObjectExpression')
        .map(objectToRecord);
    }
  }
  return [];
}

let cache = null;

export async function readRegistry({ fresh = false } = {}) {
  if (cache && !fresh) return cache;

  const source = await readFile(REGISTRY_FILE, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });

  const tools = extractExportedArray(ast, 'tools');
  const categories = extractExportedArray(ast, 'CATEGORIES');

  if (tools.length === 0 || categories.length === 0) {
    throw new Error(
      `Could not read tools/CATEGORIES from ${REGISTRY_FILE}. Its structure may have changed - scripts/lib/registryData.js needs updating.`,
    );
  }

  cache = {
    tools,
    categories,
    toolIds: new Set(tools.map((tool) => tool.id)),
    categoryIds: new Set(categories.map((category) => category.id)),
  };
  return cache;
}

export function clearRegistryCache() {
  cache = null;
}
