// -----------------------------------------------------------------------
// THE SITE ADAPTER
//
// ★ This is the ONLY module in the pipeline that knows anything about the
//   website's layout: where articles live, how the tool registry is
//   shaped, how to build the site. Everything else talks to the site
//   through this file.
//
// If the blog moves directories, frontmatter gains a field, or the site
// migrates to a CMS - one file changes. Without this seam, path knowledge
// smears across twenty modules and the pipeline is permanently welded to
// today's layout.
// -----------------------------------------------------------------------

import { readdir, readFile, writeFile, rm, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as acorn from 'acorn';
import { REPO_ROOT, config } from '../../config/pipeline.config.js';
import { parseFrontmatter } from '../../../src/blog/frontmatter.js';
import { ExternalError } from '../core/errors.js';

export const BLOG_CONTENT_DIR = path.join(REPO_ROOT, 'src', 'content', 'blog');
export const REGISTRY_FILE = path.join(REPO_ROOT, 'src', 'tools', 'registry.js');
export const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

// Re-exported so gates parse frontmatter with the exact same code the
// website uses to render it - the two can never drift apart.
export { parseFrontmatter };

// --- The tool registry ----------------------------------------------------
//
// registry.js can't simply be imported here: it pulls in lucide-react and
// a few dozen .jsx components, none of which Node can load.
//
// It is, however, syntactically plain ESM - the .jsx files are only
// referenced by import path, never with JSX syntax in the file itself. So
// it parses cleanly with acorn, and the string-literal fields can be read
// straight off the AST.
//
// Parsing the AST rather than regex-matching matters here: a missed tool
// id would make the links gate report a hallucinated-tool error for a
// tool that genuinely exists, quarantining perfectly good articles for a
// reason that looks like a content problem but isn't.

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
    if (value !== undefined) record[key] = value;
  }
  return record;
}

// Finds `export const <name> = [ ... ]` and returns the array's object
// literals as plain records.
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

let registryCache = null;

export async function readRegistry() {
  if (registryCache) return registryCache;

  const source = await readFile(REGISTRY_FILE, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });

  const tools = extractExportedArray(ast, 'tools');
  const categories = extractExportedArray(ast, 'CATEGORIES');

  if (tools.length === 0 || categories.length === 0) {
    throw new ExternalError(
      'Could not read tools/CATEGORIES from src/tools/registry.js. Its structure may have changed - this adapter needs updating.',
      { registryFile: REGISTRY_FILE, toolsFound: tools.length, categoriesFound: categories.length },
    );
  }

  registryCache = {
    tools,
    categories,
    toolIds: new Set(tools.map((tool) => tool.id)),
    categoryIds: new Set(categories.map((category) => category.id)),
  };
  return registryCache;
}

/** Test seam / long-running processes: forget the parsed registry. */
export function clearRegistryCache() {
  registryCache = null;
}

// --- Articles -------------------------------------------------------------

export function articlePath(slug) {
  return path.join(BLOG_CONTENT_DIR, `${slug}.md`);
}

// Mirrors blogUtils.js's own glob: files starting with `_` are templates,
// not articles, and must never be treated as published content.
export async function listArticleFiles() {
  try {
    const files = await readdir(BLOG_CONTENT_DIR);
    return files.filter((file) => file.endsWith('.md') && !file.startsWith('_')).sort();
  } catch {
    return [];
  }
}

export async function readArticleFile(file) {
  const raw = await readFile(path.join(BLOG_CONTENT_DIR, file), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return {
    file,
    slug: data.slug || file.replace(/\.md$/, ''),
    frontmatter: data,
    body,
    raw,
  };
}

export async function readAllArticles() {
  const files = await listArticleFiles();
  const articles = [];
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop -- small corpus, sequential reads keep memory flat and errors attributable
    articles.push(await readArticleFile(file));
  }
  return articles;
}

export async function writeArticleFile(slug, raw) {
  await mkdir(BLOG_CONTENT_DIR, { recursive: true });
  await writeFile(articlePath(slug), raw, 'utf8');
  return articlePath(slug);
}

export async function removeArticleFile(slug) {
  await rm(articlePath(slug), { force: true });
}

export async function articleExists(slug) {
  try {
    await access(articlePath(slug));
    return true;
  } catch {
    return false;
  }
}

/** Resolves a site-absolute asset path (e.g. "/blog/cover.jpg") against public/. */
export async function publicAssetExists(assetPath) {
  const relative = assetPath.replace(/^\//, '');
  try {
    await access(path.join(PUBLIC_DIR, relative));
    return true;
  } catch {
    return false;
  }
}

// --- Build ----------------------------------------------------------------
//
// Running the real build is the gate that makes autonomous production
// defensible: it catches everything static analysis can't - an unclosed
// code fence that breaks `marked`, a frontmatter value that trips the
// parser, an import that doesn't resolve. An article isn't done until the
// actual site compiles with it in place.

export function runSiteBuild() {
  const { binary, args, timeoutMs } = config.build;

  return new Promise((resolve) => {
    // No shell anywhere in this pipeline: Vite's entry point is a plain
    // .js file, so the current Node executable can run it directly.
    const child = spawn(process.execPath, [path.join(REPO_ROOT, binary), ...args], {
      cwd: REPO_ROOT,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: !timedOut && code === 0, code, stdout, stderr, timedOut });
    });
  });
}
