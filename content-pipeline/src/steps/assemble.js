// -----------------------------------------------------------------------
// STEP: assemble
//
// Produces the final markdown file. Deliberately the ONLY writer of a
// publishable .md in the whole system, so the frontmatter contract is
// enforced in exactly one place no matter how the body was produced -
// hand-written today, model-written from phase 2.
//
// In phase 1 the body already IS markdown, so this is close to a copy.
// It stops being trivial in phase 2, when the Writer emits structured
// JSON (frontmatter object + sections array) that has to be serialised
// into frontmatter + body. Having the step exist now means that change
// touches one file instead of the pipeline.
// -----------------------------------------------------------------------

import { loadJob, recordArtifact, transition } from '../core/job.js';
import { assertCanRun } from '../core/machine.js';
import { readArtifact, writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { parseFrontmatter } from '../adapters/site.js';

export const name = 'assemble';

// Field order in the output file. Fixed so every generated article looks
// the same in a diff, and so a reviewer's eye lands on the same field in
// the same place every time.
const FIELD_ORDER = [
  'title',
  'slug',
  'category',
  'description',
  'excerpt',
  'tags',
  'author',
  'publishDate',
  'updatedDate',
  'featured',
  'difficulty',
  'readingTime',
  'coverImage',
  'seoTitle',
  'metaDescription',
  'relatedTools',
  'relatedArticles',
];

// Serialises a value in the same mini-YAML dialect src/blog/frontmatter.js
// parses: single-line scalars and one-level inline arrays. Strings are
// quoted whenever a bare value would be ambiguous to that parser - a
// colon would look like a nested key, and a leading "[" like an array.
function serializeValue(value) {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);

  const text = String(value);
  const needsQuotes = /[:#]/.test(text) || text.startsWith('[') || text.trim() !== text;
  return needsQuotes ? `"${text.replace(/"/g, '\\"')}"` : text;
}

export function serializeFrontmatter(data) {
  const keys = [
    ...FIELD_ORDER.filter((key) => data[key] !== undefined && data[key] !== null),
    // Anything not in FIELD_ORDER still gets written, so an unexpected
    // field is never silently dropped on the floor.
    ...Object.keys(data).filter((key) => !FIELD_ORDER.includes(key)),
  ];

  const lines = keys.map((key) => `${key}: ${serializeValue(data[key])}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

async function loadBody(job) {
  for (const artifact of ['revised.md', 'edited.md', 'draft.md', 'source.md']) {
    if (job.artifacts.includes(artifact)) return readArtifact(job.id, artifact);
  }
  throw new Error(`Job "${job.id}" has no body artifact to assemble.`);
}

export async function run(jobId) {
  const job = await loadJob(jobId);
  assertCanRun(name, job);
  await EVENTS.stepStarted(job.id, { step: name });

  const raw = await loadBody(job);
  const { data, body } = parseFrontmatter(raw);

  // Normalise the slug into the frontmatter so the published file is
  // self-describing rather than depending on its filename.
  const slug = job.slug ?? data.slug;
  const frontmatter = { ...data, slug };

  const article = `${serializeFrontmatter(frontmatter)}\n${body.trimStart()}`;

  await writeArtifact(job.id, 'article.md', article);
  await recordArtifact(job, 'article.md');

  await transition(job, 'assembled', { slug, title: frontmatter.title ?? job.title });
  await EVENTS.stepFinished(job.id, { step: name, bytes: article.length });

  return { job, article };
}
