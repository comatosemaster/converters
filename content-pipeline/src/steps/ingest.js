// -----------------------------------------------------------------------
// STEP: ingest
//
// Creates a job from a hand-written markdown file. This is phase 1's
// entry point - the front of the pipeline (scout → research → outline →
// draft) arrives in later phases, and when it does, it will produce the
// same `source.md` artifact and everything downstream is unchanged.
//
// The job enters at state `drafted`, which is honest: a body exists and
// has not been reviewed. It's also what lets the same review/stage/publish
// path serve both a human-written file today and a model-written one later.
// -----------------------------------------------------------------------

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createJob, recordArtifact, transition } from '../core/job.js';
import { writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { parseFrontmatter } from '../adapters/site.js';
import { ContractError } from '../core/errors.js';

export const name = 'ingest';

export async function run({ file, slug: slugOverride }) {
  const absolute = path.resolve(process.cwd(), file);

  let raw;
  try {
    raw = await readFile(absolute, 'utf8');
  } catch {
    throw new ContractError(`Cannot read "${file}".`, { file: absolute });
  }

  const { data } = parseFrontmatter(raw);
  if (Object.keys(data).length === 0) {
    throw new ContractError(
      `"${file}" has no frontmatter block. Every article needs one - see src/content/blog/_TEMPLATE.md.`,
      { file: absolute },
    );
  }

  // Slug precedence: explicit flag, then frontmatter, then filename. The
  // filename fallback matches how blogUtils.js resolves a slug when
  // frontmatter omits it, so ingest and render agree.
  const slug = slugOverride || data.slug || path.basename(absolute).replace(/\.md$/, '');

  const job = await createJob({
    slug,
    title: data.title ?? slug,
    state: 'queued',
    source: 'manual',
  });

  await writeArtifact(job.id, 'source.md', raw);
  await recordArtifact(job, 'source.md');

  await EVENTS.stepFinished(job.id, { step: name, sourceFile: absolute, slug });

  // Straight to `drafted`: a body exists. It has not been reviewed, and
  // the state name says exactly that.
  await transition(job, 'drafted', { slug, title: data.title ?? slug });

  return job;
}
