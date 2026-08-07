// -----------------------------------------------------------------------
// JOB LIFECYCLE
//
// A job is a directory. This module is the only thing that creates one,
// reads it, or moves it between states - so every transition is validated
// and logged in exactly one place.
// -----------------------------------------------------------------------

import path from 'node:path';
import { STATES, isTerminal } from './machine.js';
import { ContractError } from './errors.js';
import { EVENTS } from './events.js';
import {
  ensureDirs,
  jobDir,
  listJobIds,
  readJson,
  writeJsonAtomic,
  exists,
} from './store.js';
import { assertValid } from './validate.js';

function jobFile(jobId) {
  return path.join(jobDir(jobId), 'job.json');
}

// Job ids are date-prefixed and slug-based: sortable by eye, obvious in
// `ls`, and collision-safe via the short suffix. Readability matters here
// because the primary debugging tool is looking at the directory.
export function makeJobId(slug) {
  const date = new Date().toISOString().slice(0, 10);
  const safeSlug = (slug || 'article')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${date}-${safeSlug}-${suffix}`;
}

export async function createJob({ slug, title, state = 'queued', source = 'manual', contentType = 'article' }) {
  const id = makeJobId(slug);
  const now = new Date().toISOString();

  const job = {
    id,
    state,
    contentType,
    locale: 'en',
    slug,
    title,
    source,
    createdAt: now,
    updatedAt: now,
    revisions: { total: 0 },
    costUsd: 0,
    artifacts: [],
  };

  await assertValid('job.schema.json', job);
  await ensureDirs(id);
  await writeJsonAtomic(jobFile(id), job);
  await EVENTS.jobCreated(id, { slug, title, state, source });

  return job;
}

export async function loadJob(jobId) {
  if (!(await exists(jobFile(jobId)))) {
    throw new ContractError(`No such job: "${jobId}".`, { jobId });
  }
  return readJson(jobFile(jobId));
}

export async function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  await assertValid('job.schema.json', job);
  await writeJsonAtomic(jobFile(job.id), job);
  return job;
}

// The single chokepoint for state changes. Refuses to move a job out of a
// terminal state, because "published" and "quarantined" mean something
// happened in the outside world (a PR exists, a human was asked) that the
// pipeline can't silently undo.
export async function transition(job, nextState, payload = {}) {
  if (!STATES[nextState]) {
    throw new ContractError(`Unknown state "${nextState}".`, { nextState });
  }
  if (isTerminal(job.state) && job.state !== nextState) {
    throw new ContractError(
      `Job "${job.id}" is in terminal state "${job.state}" and cannot move to "${nextState}".`,
      { jobId: job.id, from: job.state, to: nextState },
    );
  }

  const from = job.state;
  job.state = nextState;
  Object.assign(job, payload);
  await saveJob(job);
  await EVENTS.stateChanged(job.id, { from, to: nextState });

  return job;
}

export async function recordArtifact(job, name) {
  if (!job.artifacts.includes(name)) {
    job.artifacts.push(name);
    await saveJob(job);
  }
  await EVENTS.artifactWritten(job.id, { artifact: name });
  return job;
}

export async function quarantine(job, reason) {
  await EVENTS.quarantined(job.id, { reason });
  return transition(job, 'quarantined', {
    quarantine: { reason, at: new Date().toISOString() },
  });
}

export async function listJobs() {
  const ids = await listJobIds();
  const jobs = [];
  for (const id of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop -- a handful of small reads; parallelism would add noise, not speed
      jobs.push(await loadJob(id));
    } catch {
      // A directory without a readable job.json isn't a job. Skip it
      // rather than letting one bad directory break `pipeline jobs`.
    }
  }
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
