// -----------------------------------------------------------------------
// STEP: draft  (agent)
//
// The only step that writes body prose, and the most expensive call in
// the pipeline - it runs on the frontier tier because this is the one
// place where model capability is directly visible in the output.
//
// It writes TWO artifacts: draft.json (the structured value, which is
// what the reviser edits) and draft.md (the same thing serialised, which
// is what the gates and the assembler read). Keeping both means the
// revision loop never has to re-parse markdown back into structure.
// -----------------------------------------------------------------------

import { loadJob, recordArtifact, transition } from '../core/job.js';
import { assertCanRun } from '../core/machine.js';
import { readArtifact, writeArtifact } from '../core/store.js';
import { EVENTS } from '../core/events.js';
import { runAgent, buildAgentContext } from '../llm/agent.js';
import { draftToMarkdown } from '../util/markdown.js';
import { ContractError } from '../core/errors.js';

export const name = 'draft';

// Frontmatter fields the model shouldn't be inventing: the publish date
// is a fact about now, and the author is a site-level constant. Filling
// them here keeps them out of the prompt, where they'd be one more thing
// to hallucinate.
function completeFrontmatter(frontmatter, { slug, outline }) {
  return {
    ...frontmatter,
    slug: frontmatter.slug ?? slug,
    category: frontmatter.category ?? outline.category,
    author: frontmatter.author ?? 'Rootconverter',
    publishDate: frontmatter.publishDate ?? new Date().toISOString().slice(0, 10),
    relatedTools: frontmatter.relatedTools ?? outline.relatedTools,
  };
}

export async function run(jobId) {
  const job = await loadJob(jobId);
  assertCanRun(name, job);

  if (!job.artifacts.includes('outline.json')) {
    throw new ContractError(`Job "${jobId}" has no outline to draft from.`, { jobId });
  }

  const outline = await readArtifact(jobId, 'outline.json');
  const context = await buildAgentContext();

  const { value: draft, meta } = await runAgent({
    agentId: 'writer',
    job,
    variables: {
      outline,
      tools: context.tools,
      houseStyle: context.houseStyle,
    },
  });

  draft.frontmatter = completeFrontmatter(draft.frontmatter, { slug: outline.slug, outline });

  await writeArtifact(jobId, 'draft.json', draft);
  await recordArtifact(job, 'draft.json');

  await writeArtifact(jobId, 'draft.md', draftToMarkdown(draft));
  await recordArtifact(job, 'draft.md');

  await transition(job, 'drafted', {
    slug: draft.frontmatter.slug,
    title: draft.frontmatter.title,
  });

  await EVENTS.stepFinished(jobId, {
    step: name,
    words: draft.body.split(/\s+/).length,
    costUsd: meta.costUsd,
  });

  return { job, draft };
}
