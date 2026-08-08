// -----------------------------------------------------------------------
// STEP: outline  (agent)
//
// Turns a topic into a structure. Deliberately separate from drafting:
// structural problems - wrong angle, missing section, no tool hook, a
// topic already covered - are far cheaper to catch here than after a
// frontier model has written two thousand words on top of them.
//
// Outlining runs on the `standard` tier; drafting is the expensive part.
// -----------------------------------------------------------------------

import { loadJob, recordArtifact, transition } from '../core/job.js';
import { assertCanRun } from '../core/machine.js';
import { readArtifact, writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { runAgent, buildAgentContext } from '../llm/agent.js';
import { ContractError } from '../core/errors.js';

export const name = 'outline';

export async function run(jobId) {
  const job = await loadJob(jobId);
  assertCanRun(name, job);

  if (!job.artifacts.includes('topic.json')) {
    throw new ContractError(
      `Job "${jobId}" has no topic. Create it with: pipeline topic "<your topic>".`,
      { jobId },
    );
  }

  const topic = await readArtifact(jobId, 'topic.json');
  const context = await buildAgentContext();

  const { value: outline, meta } = await runAgent({
    agentId: 'outliner',
    job,
    variables: {
      topic: topic.topic,
      tools: context.tools,
      categories: context.categories,
      existingArticles: context.existingArticles,
      houseStyle: context.houseStyle,
    },
  });

  await writeArtifact(jobId, 'outline.json', outline);
  await recordArtifact(job, 'outline.json');

  await transition(job, 'outlined', { slug: outline.slug, title: outline.title });
  await EVENTS.stepFinished(jobId, {
    step: name,
    sections: outline.sections.length,
    costUsd: meta.costUsd,
  });

  return { job, outline };
}
