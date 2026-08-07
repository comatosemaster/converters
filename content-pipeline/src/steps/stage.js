// -----------------------------------------------------------------------
// STEP: stage
//
// Writes the article into the real site and runs the real build.
//
// This is the gate that makes autonomous production defensible. Every
// check before it reasons ABOUT the article; this one puts the article in
// the site and asks the actual toolchain whether it works. It catches the
// whole class of failures static analysis can't see: an unclosed code
// fence that breaks `marked` at render time, a frontmatter value that
// trips the parser, a cover image path that doesn't resolve.
//
// If the build fails, the file is removed again. The working tree must be
// left exactly as it was found - a failed stage that leaves a broken
// article behind would break the next `npm run dev`, and worse, could be
// committed by hand later without anyone realising the pipeline rejected it.
// -----------------------------------------------------------------------

import { loadJob, quarantine, recordArtifact, transition } from '../core/job.js';
import { assertCanRun } from '../core/machine.js';
import { readArtifact, writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { articleExists, removeArticleFile, runSiteBuild, writeArticleFile } from '../adapters/site.js';
import { ContractError } from '../core/errors.js';

export const name = 'stage';

// Vite prints errors to stdout as often as stderr, and a 2000-line build
// log helps nobody. Keep the tail, where the failure actually is.
function buildFailureExcerpt({ stdout, stderr }, lines = 25) {
  const combined = `${stdout}\n${stderr}`.trim().split('\n');
  return combined.slice(-lines).join('\n');
}

export async function run(jobId, { skipBuild = false } = {}) {
  const job = await loadJob(jobId);
  assertCanRun(name, job);
  await EVENTS.stepStarted(job.id, { step: name });

  const slug = job.slug;
  if (!slug) throw new ContractError(`Job "${jobId}" has no slug; cannot stage.`, { jobId });

  // Refuse to silently overwrite. The frontmatter gate already checks for
  // slug collisions, so reaching this means the corpus changed underneath
  // us - another job staged the same slug, or someone added it by hand.
  if (await articleExists(slug)) {
    await quarantine(job, `An article already exists at src/content/blog/${slug}.md; staging would overwrite it.`);
    return { job, ok: false, reason: 'slug-collision' };
  }

  const article = await readArtifact(job.id, 'article.md');
  const written = await writeArticleFile(slug, article);
  await EVENTS.stepFinished(job.id, { step: name, phase: 'written', path: written });

  if (skipBuild) {
    await transition(job, 'staged');
    return { job, ok: true, built: false };
  }

  const build = await runSiteBuild();

  await writeArtifact(job.id, 'build.json', {
    ok: build.ok,
    code: build.code,
    timedOut: build.timedOut,
    excerpt: build.ok ? null : buildFailureExcerpt(build),
  });
  await recordArtifact(job, 'build.json');

  if (!build.ok) {
    // Roll back so the working tree is exactly as we found it.
    await removeArticleFile(slug);
    await EVENTS.stepFailed(job.id, {
      step: name,
      reason: build.timedOut ? 'build-timeout' : 'build-failed',
      excerpt: buildFailureExcerpt(build, 10),
    });
    await quarantine(
      job,
      build.timedOut
        ? 'The site build timed out while verifying this article.'
        : 'The site build failed with this article in place. See artifacts/build.json.',
    );
    return { job, ok: false, reason: 'build-failed', build };
  }

  await transition(job, 'staged');
  await EVENTS.stepFinished(job.id, { step: name, phase: 'built', ok: true });

  return { job, ok: true, built: true, path: written };
}
