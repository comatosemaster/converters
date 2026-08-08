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
import { writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { parseFrontmatter } from '../adapters/site.js';
import { readLatestMarkdown } from '../util/artifacts.js';
import { draftToMarkdown, serializeFrontmatter } from '../util/markdown.js';

export const name = 'assemble';

export async function run(jobId) {
  const job = await loadJob(jobId);
  assertCanRun(name, job);
  await EVENTS.stepStarted(job.id, { step: name });

  // Resolved through the shared helper so the assembler ships exactly
  // what the reviewer approved - the newest revision, not the original
  // draft. Getting this wrong would publish unreviewed content.
  const source = await readLatestMarkdown(jobId, { draftToMarkdown });
  if (!source) throw new Error(`Job "${jobId}" has no body artifact to assemble.`);

  const { data, body } = parseFrontmatter(source.raw);

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
