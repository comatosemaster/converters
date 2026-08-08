// -----------------------------------------------------------------------
// ARTIFACT RESOLUTION
//
// Several steps need "the newest version of the article", and they must
// all agree on what that means - if the reviser writes revision 3 and the
// reviewer reads revision 2, the loop silently never converges and the
// symptom looks like a model that won't follow instructions.
//
// So the precedence rule lives here, once.
//
// Artifacts are append-only: revision N writes revised.vN.json rather
// than overwriting. Disk is free; being able to diff exactly what a
// revision changed is what makes the loop debuggable, and it's what the
// oscillation detector reads.
// -----------------------------------------------------------------------

import { listArtifacts, readArtifact } from '../core/store.js';

// Newest stage first. A revision supersedes a draft, a draft supersedes
// an ingested file.
const BODY_PRECEDENCE = ['revised', 'edited', 'draft', 'source'];

function versionOf(filename, stem) {
  if (filename === `${stem}.md` || filename === `${stem}.json`) return 1;
  const match = filename.match(new RegExp(`^${stem}\\.v(\\d+)\\.(?:md|json)$`));
  return match ? Number(match[1]) : null;
}

/**
 * Finds the newest body artifact for a job.
 * @returns {{ name, stem, version, format }} or null
 */
export async function findLatestBody(jobId) {
  const files = await listArtifacts(jobId);

  for (const stem of BODY_PRECEDENCE) {
    const candidates = files
      .map((file) => ({ file, version: versionOf(file, stem) }))
      .filter((entry) => entry.version !== null)
      .sort((a, b) => b.version - a.version);

    // Prefer the structured form: the reviser edits JSON, and re-parsing
    // markdown back into structure loses the frontmatter/body split.
    const json = candidates.find((entry) => entry.file.endsWith('.json'));
    const markdown = candidates.find((entry) => entry.file.endsWith('.md'));
    const chosen = json ?? markdown;

    if (chosen) {
      return {
        name: chosen.file,
        stem,
        version: chosen.version,
        format: chosen.file.endsWith('.json') ? 'json' : 'md',
        markdownName: markdown?.file ?? null,
      };
    }
  }

  return null;
}

/** The newest body as raw markdown, whichever form it was stored in. */
export async function readLatestMarkdown(jobId, { draftToMarkdown } = {}) {
  const latest = await findLatestBody(jobId);
  if (!latest) return null;

  // Prefer a sibling .md when one exists - it's already serialised by the
  // same code the assembler uses, so gates see exactly what will ship.
  if (latest.markdownName) {
    return { name: latest.markdownName, raw: await readArtifact(jobId, latest.markdownName) };
  }

  const value = await readArtifact(jobId, latest.name);
  if (typeof value === 'string') return { name: latest.name, raw: value };

  if (!draftToMarkdown) {
    throw new Error(`Artifact ${latest.name} is structured, but no serialiser was provided.`);
  }
  return { name: latest.name, raw: draftToMarkdown(value) };
}

/** The newest structured draft ({ frontmatter, body }), or null. */
export async function readLatestDraft(jobId) {
  const latest = await findLatestBody(jobId);
  if (!latest || latest.format !== 'json') return null;
  return { name: latest.name, stem: latest.stem, version: latest.version, value: await readArtifact(jobId, latest.name) };
}

/** The newest review verdict artifact, or null. */
export async function readLatestReview(jobId) {
  const files = await listArtifacts(jobId);
  const reviews = files
    .map((file) => ({ file, version: versionOf(file, 'review') }))
    .filter((entry) => entry.version !== null)
    .sort((a, b) => b.version - a.version);

  if (reviews.length === 0) return null;
  return { name: reviews[0].file, version: reviews[0].version, value: await readArtifact(jobId, reviews[0].file) };
}

/** Every review so far, oldest first - used to detect oscillation. */
export async function readReviewHistory(jobId) {
  const files = await listArtifacts(jobId);
  const reviews = files
    .map((file) => ({ file, version: versionOf(file, 'review') }))
    .filter((entry) => entry.version !== null)
    .sort((a, b) => a.version - b.version);

  const history = [];
  for (const entry of reviews) {
    // eslint-disable-next-line no-await-in-loop -- a handful of small reads, kept ordered
    history.push({ version: entry.version, value: await readArtifact(jobId, entry.file) });
  }
  return history;
}

export function countErrors(review) {
  return (review?.verdicts ?? []).reduce(
    (total, verdict) => total + verdict.findings.filter((finding) => finding.severity === 'error').length,
    0,
  );
}
