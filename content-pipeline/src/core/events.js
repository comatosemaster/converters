// -----------------------------------------------------------------------
// EVENT LOG
//
// One append-only JSONL file per job. This is the audit trail: every
// state transition, every gate verdict, every failure, and (from phase 2)
// every model call with its token count and cost.
//
// Append-only and never rewritten, which is what makes it trustworthy -
// when output quality drops, "what changed?" is answerable by reading
// this rather than by guessing. It's also why model id and prompt version
// are recorded per call: without them a regression is undebuggable.
// -----------------------------------------------------------------------

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { jobDir } from './store.js';

function eventLogPath(jobId) {
  return path.join(jobDir(jobId), 'events.jsonl');
}

export async function appendEvent(jobId, type, payload = {}) {
  const event = { at: new Date().toISOString(), type, ...payload };
  const file = eventLogPath(jobId);
  await mkdir(path.dirname(file), { recursive: true });
  // A single appendFile of one line is atomic enough for our concurrency
  // (one process per job, enforced by the lock), and unlike a
  // read-modify-write it can't lose earlier events on a crash.
  await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export async function readEvents(jobId) {
  try {
    const raw = await readFile(eventLogPath(jobId), 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          // A malformed line should never hide the rest of the history.
          return { at: null, type: 'unparseable', raw: line };
        }
      });
  } catch {
    return [];
  }
}

// Convenience wrappers - named so a grep for `EVENTS.` shows every kind
// of thing the system records.
export const EVENTS = {
  jobCreated: (jobId, payload) => appendEvent(jobId, 'job.created', payload),
  stateChanged: (jobId, payload) => appendEvent(jobId, 'job.state_changed', payload),
  stepStarted: (jobId, payload) => appendEvent(jobId, 'step.started', payload),
  stepFinished: (jobId, payload) => appendEvent(jobId, 'step.finished', payload),
  stepFailed: (jobId, payload) => appendEvent(jobId, 'step.failed', payload),
  gateVerdict: (jobId, payload) => appendEvent(jobId, 'gate.verdict', payload),
  artifactWritten: (jobId, payload) => appendEvent(jobId, 'artifact.written', payload),
  quarantined: (jobId, payload) => appendEvent(jobId, 'job.quarantined', payload),
  published: (jobId, payload) => appendEvent(jobId, 'job.published', payload),
  // Phase 2+: one per model call.
  llmCall: (jobId, payload) => appendEvent(jobId, 'llm.call', payload),
};
