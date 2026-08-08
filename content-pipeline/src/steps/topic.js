// -----------------------------------------------------------------------
// STEP: topic
//
// Creates a job from a topic string. The front door for AI-generated
// articles, as `ingest` is for hand-written ones - both converge on the
// same review → assemble → stage → publish path.
//
// A topic is stored as an artifact rather than only as a job field so it
// stays part of the append-only record: when an article turns out badly,
// the exact wording that produced it is still on disk.
// -----------------------------------------------------------------------

import { createJob, recordArtifact } from '../core/job.js';
import { writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { ContractError } from '../core/errors.js';

export const name = 'topic';

function slugHint(topic) {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
}

export async function run({ topic, category, notes }) {
  if (!topic || topic.trim().length < 8) {
    throw new ContractError('A topic needs to be at least 8 characters - enough for the outliner to work with.');
  }

  const job = await createJob({
    slug: slugHint(topic),
    title: topic.trim(),
    // `queued` rather than `researched`: the research step doesn't exist
    // yet, and route() will skip straight to outline because that's the
    // first implemented transition out of this state.
    state: 'queued',
    source: 'scout',
  });

  await writeArtifact(job.id, 'topic.json', {
    topic: topic.trim(),
    category: category ?? null,
    notes: notes ?? null,
    createdAt: new Date().toISOString(),
  });
  await recordArtifact(job, 'topic.json');

  await EVENTS.stepFinished(job.id, { step: name, topic: topic.trim() });

  return job;
}
