#!/usr/bin/env node
// -----------------------------------------------------------------------
// PIPELINE CLI
//
// A thin runner. It holds no domain knowledge - it loads a job, asks
// machine.route() what to do next, and invokes that step. All real logic
// lives in steps and gates, which is what lets a later phase add a step
// by writing a module and registering it, without touching this file.
//
// Headless and exit-code-driven throughout, so the same commands work
// unchanged from a terminal today and from a scheduler later.
//
// Usage: npm run pipeline -- <command> [args]
// -----------------------------------------------------------------------

import { parseArgs } from 'node:util';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { ensureDataDirs, listArtifacts, readArtifact } from './core/store.js';
import { loadJob, listJobs, quarantine, transition } from './core/job.js';
import { readEvents } from './core/events.js';
import { withLock } from './core/lock.js';
import { isTerminal, route, STATES } from './core/machine.js';
import { IMPLEMENTED, LLM_STEPS, getStep } from './steps/index.js';
import * as ingestStep from './steps/ingest.js';
import * as topicStep from './steps/topic.js';
import { loadEnv, hasApiKey } from './core/env.js';
import { activeProvider } from './llm/client.js';
import { runTotal } from './core/budget.js';
import { formatUsd } from './llm/cost.js';
import { runGates, listGates } from './gates/index.js';
import { loadCorpus } from './corpus/index.js';
import { parseFrontmatter } from './adapters/site.js';
import { color, printJobSummary, printOutcome, printVerdicts } from './util/report.js';
import { PipelineError } from './core/errors.js';

const HELP = `
${color.bold('Rootconverter content pipeline')}

${color.bold('Write an article with AI')}
  topic "<topic>"              Create a job from a topic, then:
  run <job-id>                 outline → draft → review → (revise) → stage → PR

${color.bold('Validate without creating a job')}
  check <file.md>              Run every gate against a markdown file and print findings.
                               The fastest way to check an article you wrote by hand.

${color.bold('Jobs')}
  ingest <file.md> [--slug s]  Create a job from an existing markdown file.
  run <job-id> [--to state]    Advance a job as far as it can go.
  step <job-id> <step>         Run exactly one step.
  status <job-id>              Show a job's state, verdicts, cost, and history.
  jobs [--state s]             List jobs.
  artifacts <job-id> [name]    List artifacts, or print one.
  quarantine <job-id> [reason] Park a job for human attention.
  abandon <job-id>             Drop a job.

${color.bold('Info')}
  gates                        List the configured quality gates.
  states                       Show the pipeline state graph.
  doctor                       Check API key, provider, and tool registry.

${color.bold('Flags')}
  --mock                       Use the built-in mock model: no network, no cost.
  --skip-build                 Stage without running the site build (faster; less safe).
  --no-pr                      Commit to a branch without opening a pull request.
  --dry-run                    Publish: show what would happen, change nothing.
  --json                       Machine-readable output.
  --verbose                    Include informational findings.

${color.gray('Walkthrough & troubleshooting:  content-pipeline/USAGE.md')}
${color.gray('Design rationale:               docs/content-pipeline-architecture.md')}
`;

function fail(message, code = 1) {
  console.error(color.red(`\n${message}\n`));
  process.exit(code);
}

// Cost is printed at the end of every run that spent anything - a number
// you have to go looking for is a number nobody looks at.
function printSpend(job) {
  const jobSpend = job.costUsd ?? 0;
  if (jobSpend === 0 && runTotal() === 0) return;
  console.log(
    color.gray(
      `Cost: ${formatUsd(jobSpend)} for this article${runTotal() !== jobSpend ? `, ${formatUsd(runTotal())} this run` : ''}.`,
    ),
  );
}

// --- check ----------------------------------------------------------------
// The standalone linter. No job, no state, no side effects - just "is this
// article publishable?" This is what makes phase 1 useful on its own,
// before a single model call exists anywhere in the system.

async function commandCheck(file, flags) {
  if (!file) fail('Usage: check <file.md>');

  const absolute = path.resolve(process.cwd(), file);
  let raw;
  try {
    raw = await readFile(absolute, 'utf8');
  } catch {
    fail(`Cannot read "${file}".`);
  }

  const { data: frontmatter, body } = parseFrontmatter(raw);
  if (Object.keys(frontmatter).length === 0) {
    fail(`"${file}" has no frontmatter block. See src/content/blog/_TEMPLATE.md.`);
  }

  const slug = frontmatter.slug || path.basename(absolute).replace(/\.md$/, '');
  // Exclude this slug: checking a file that's already in the content
  // directory shouldn't report it as a duplicate of itself.
  const corpus = await loadCorpus({ excludeSlug: slug });

  const { verdicts, outcome } = await runGates({ frontmatter, body, slug, corpus });

  if (flags.json) {
    console.log(JSON.stringify({ file: absolute, slug, outcome, verdicts }, null, 2));
  } else {
    console.log(`\n${color.bold(file)} ${color.gray(`(slug: ${slug})`)}`);
    printVerdicts(verdicts, { showInfo: flags.verbose });
    printOutcome(outcome);
  }

  process.exit(outcome === 'pass' ? 0 : 1);
}

// --- ingest ---------------------------------------------------------------

async function commandIngest(file, flags) {
  if (!file) fail('Usage: ingest <file.md> [--slug my-slug]');
  const job = await ingestStep.run({ file, slug: flags.slug });
  console.log(`\n${color.green('Created job')} ${color.bold(job.id)}  ${color.gray(`(state: ${job.state})`)}`);
  console.log(color.gray(`\nNext: npm run pipeline -- run ${job.id}\n`));
}

// --- topic ----------------------------------------------------------------

async function commandTopic(topic, flags) {
  if (!topic) fail('Usage: topic "What Base64 encoding actually does"');

  const job = await topicStep.run({ topic, category: flags.category });
  console.log(`\n${color.green('Created job')} ${color.bold(job.id)}`);
  console.log(color.gray(`  topic: ${topic}`));
  console.log(color.gray(`\nNext: npm run pipeline -- run ${job.id}${flags.mock ? ' --mock' : ''}\n`));
}

// --- doctor ---------------------------------------------------------------
// Answers "is this thing configured?" in one command, so a missing key is
// found before a run rather than three steps into one.

async function commandDoctor() {
  console.log(`\n${color.bold('Configuration')}\n`);

  const provider = activeProvider();
  const key = hasApiKey();

  console.log(`  provider        ${provider === 'mock' ? color.yellow('mock (no network, no cost)') : 'anthropic'}`);
  console.log(`  ANTHROPIC_API_KEY  ${key ? color.green('set') : color.red('not set')}`);

  if (!key && provider !== 'mock') {
    console.log(
      color.gray(
        '\n  Add it to a .env at the repo root (see content-pipeline/.env.example),\n  or pass --mock to run without a model.',
      ),
    );
  }

  try {
    const { readRegistry } = await import('./adapters/site.js');
    const registry = await readRegistry();
    console.log(`  tool registry   ${color.green(`${registry.tools.length} tools, ${registry.categories.length} categories`)}`);
  } catch (error) {
    console.log(`  tool registry   ${color.red(`FAILED — ${error.message}`)}`);
  }

  const { readAllArticles } = await import('./adapters/site.js');
  const articles = await readAllArticles();
  console.log(`  published       ${articles.length} article${articles.length === 1 ? '' : 's'}`);
  console.log();
}

// --- run ------------------------------------------------------------------
// The whole runner: ask where to go, go there, repeat. Every branch in the
// pipeline is decided by machine.route(), not here.

async function commandRun(jobId, flags) {
  if (!jobId) fail('Usage: run <job-id> [--to <state>]');

  await withLock(jobId, async () => {
    // A step that returns without changing state would spin this loop
    // forever. That must never happen, but "must never happen" is not a
    // guarantee worth betting a scheduled run on, so the loop detects it
    // and stops instead of burning CPU (or, from phase 2, money).
    let previousState = null;
    let sameStateRuns = 0;

    for (;;) {
      const job = await loadJob(jobId);

      if (job.state === previousState) {
        sameStateRuns++;
        if (sameStateRuns >= 2) {
          fail(
            `Pipeline stalled: job stayed in state "${job.state}" across repeated steps. This is a bug in the step for that state.`,
          );
        }
      } else {
        sameStateRuns = 0;
      }
      previousState = job.state;

      if (flags.to && job.state === flags.to) {
        console.log(color.green(`\nReached target state "${flags.to}".\n`));
        return;
      }

      const decision = route(job, IMPLEMENTED);

      if (decision.kind === 'terminal') {
        console.log(`\n${color.bold(job.state)} — nothing left to do.`);
        if (job.state === 'quarantined') console.log(color.gray(`Reason: ${job.quarantine?.reason ?? 'unknown'}`));
        if (job.publish?.prUrl) console.log(color.gray(`Pull request: ${job.publish.prUrl}`));
        printSpend(job);
        console.log();
        return;
      }

      if (decision.kind === 'halt') {
        console.log(`\n${color.yellow('Stopped')}: ${decision.reason}\n`);
        if (job.lastVerdict?.failedGates?.length) {
          console.log(color.gray(`Failed gates: ${job.lastVerdict.failedGates.join(', ')}`));
          console.log(color.gray(`Run: npm run pipeline -- status ${jobId}\n`));
        }
        process.exitCode = 1;
        return;
      }

      if (decision.kind === 'blocked') {
        console.log(`\n${color.yellow('Blocked')}: ${decision.reason}\n`);
        process.exitCode = 1;
        return;
      }

      const step = getStep(decision.step);
      const isLlm = LLM_STEPS.has(decision.step);
      console.log(
        color.gray(`→ ${decision.step}${isLlm ? ` ${activeProvider() === 'mock' ? '(mock)' : '(model)'}` : ''}…`),
      );

      const result = await step.run(jobId, {
        skipBuild: flags['skip-build'],
        noPr: flags['no-pr'],
        dryRun: flags['dry-run'],
      });

      // The review step is the one place worth printing detail inline -
      // its findings are the reason a run stops, so burying them behind a
      // separate `status` call would just cost the operator a round trip.
      if (decision.step === 'review' && result?.verdicts) {
        printVerdicts(result.verdicts, { showInfo: flags.verbose });
        printOutcome(result.outcome);
      }

      if (decision.step === 'publish' && result?.ok) {
        if (result.dryRun) {
          console.log(color.gray(`\nDry run: would commit ${result.relativePath} on branch ${result.branch}\n`));
          return;
        }
        console.log(`\n${color.green('Published')} — branch ${color.bold(result.branch)}`);
        if (result.prUrl) console.log(`${color.bold('Pull request:')} ${result.prUrl}`);
        printSpend(result.job);
        console.log(color.gray('\nMerging that PR deploys it to production.\n'));
        return;
      }

      // A step that ended the job (quarantine on build failure, say) has
      // nowhere left to go; loop round and let the terminal branch report it.
      const updated = await loadJob(jobId);
      if (isTerminal(updated.state) && updated.state !== 'published') {
        console.log(`\n${color.red(updated.state)}: ${updated.quarantine?.reason ?? ''}\n`);
        process.exitCode = 1;
        return;
      }
    }
  });
}

// --- step -----------------------------------------------------------------

async function commandStep(jobId, stepName, flags) {
  if (!jobId || !stepName) fail('Usage: step <job-id> <step-name>');
  const step = getStep(stepName);
  if (!step) fail(`Unknown step "${stepName}". Available: ${[...IMPLEMENTED].join(', ')}`);

  await withLock(jobId, async () => {
    const result = await step.run(jobId, {
      skipBuild: flags['skip-build'],
      noPr: flags['no-pr'],
      dryRun: flags['dry-run'],
    });

    if (result?.verdicts) {
      printVerdicts(result.verdicts, { showInfo: flags.verbose });
      printOutcome(result.outcome);
    }
    const job = await loadJob(jobId);
    console.log(color.gray(`\nState: ${job.state}\n`));
  });
}

// --- status ---------------------------------------------------------------

async function commandStatus(jobId, flags) {
  if (!jobId) return commandJobs(flags);

  const job = await loadJob(jobId);
  if (flags.json) {
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  console.log(`\n${color.bold(job.id)}`);
  console.log(`  state      ${job.state}  ${color.gray(STATES[job.state]?.description ?? '')}`);
  console.log(`  title      ${job.title ?? color.gray('(none)')}`);
  console.log(`  slug       ${job.slug ?? color.gray('(none)')}`);
  console.log(`  created    ${job.createdAt}`);
  if (job.quarantine) console.log(`  ${color.red('quarantined')} ${job.quarantine.reason}`);
  if (job.publish?.prUrl) console.log(`  pr         ${job.publish.prUrl}`);

  const artifacts = await listArtifacts(jobId);
  console.log(`  artifacts  ${artifacts.join(', ') || color.gray('(none)')}`);
  if (job.costUsd) console.log(`  cost       ${formatUsd(job.costUsd)}`);
  if (job.revisions?.total) console.log(`  revisions  ${job.revisions.total}`);

  // Surface the most recent review inline - it's almost always what the
  // operator opened `status` to find out.
  const reviews = artifacts.filter((name) => name.startsWith('review')).sort();
  if (reviews.length > 0) {
    const review = await readArtifact(jobId, reviews[reviews.length - 1]);
    printVerdicts(review.verdicts, { showInfo: flags.verbose });
    printOutcome(review.outcome);
  }

  if (flags.verbose) {
    const events = await readEvents(jobId);
    console.log(`\n${color.bold('History')}`);
    for (const event of events) console.log(`  ${color.gray(event.at)}  ${event.type}`);
  }
  console.log();
}

// --- jobs -----------------------------------------------------------------

async function commandJobs(flags) {
  const jobs = await listJobs();
  const filtered = flags.state ? jobs.filter((job) => job.state === flags.state) : jobs;

  if (flags.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  if (filtered.length === 0) {
    console.log(color.gray('\nNo jobs.\n'));
    return;
  }

  console.log();
  for (const job of filtered) printJobSummary(job);
  console.log();
}

// --- artifacts ------------------------------------------------------------

async function commandArtifacts(jobId, artifactName) {
  if (!jobId) fail('Usage: artifacts <job-id> [artifact-name]');

  if (!artifactName) {
    const names = await listArtifacts(jobId);
    console.log(names.length ? `\n${names.map((name) => `  ${name}`).join('\n')}\n` : color.gray('\nNo artifacts.\n'));
    return;
  }

  const artifact = await readArtifact(jobId, artifactName);
  console.log(typeof artifact === 'string' ? artifact : JSON.stringify(artifact, null, 2));
}

// --- misc -----------------------------------------------------------------

async function commandQuarantine(jobId, reason) {
  if (!jobId) fail('Usage: quarantine <job-id> [reason]');
  const job = await loadJob(jobId);
  await quarantine(job, reason || 'Parked manually.');
  console.log(color.yellow(`\nQuarantined ${jobId}\n`));
}

async function commandAbandon(jobId) {
  if (!jobId) fail('Usage: abandon <job-id>');
  const job = await loadJob(jobId);
  await transition(job, 'abandoned');
  console.log(color.gray(`\nAbandoned ${jobId}\n`));
}

function commandGates() {
  console.log(`\n${color.bold('Gates')} ${color.gray('(cheapest tier first; a run stops at the first failing tier)')}\n`);
  for (const gate of listGates().sort((a, b) => a.tier - b.tier)) {
    console.log(`  ${color.gray(`tier ${gate.tier}`)}  ${gate.id}`);
  }
  console.log();
}

function commandStates() {
  console.log(`\n${color.bold('Pipeline states')}\n`);
  for (const [name, meta] of Object.entries(STATES)) {
    const marker = meta.terminal ? color.gray(' (terminal)') : '';
    console.log(`  ${color.bold(name.padEnd(13))}${meta.description}${marker}`);
  }
  console.log(`\n${color.bold('Implemented steps')}: ${[...IMPLEMENTED].join(', ')}\n`);
}

// --- entry point ----------------------------------------------------------

async function main() {
  const { values: flags, positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
      slug: { type: 'string' },
      state: { type: 'string' },
      category: { type: 'string' },
      to: { type: 'string' },
      mock: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      'skip-build': { type: 'boolean', default: false },
      'no-pr': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  const [command, ...args] = positionals;

  if (!command || flags.help || command === 'help') {
    console.log(HELP);
    return;
  }

  loadEnv();
  // --mock is expressed as an env var so it reaches llm/client.js without
  // every step having to thread a flag down to it.
  if (flags.mock) process.env.PIPELINE_MOCK_LLM = '1';

  await ensureDataDirs();

  switch (command) {
    case 'check':
      return commandCheck(args[0], flags);
    case 'topic':
      return commandTopic(args.join(' '), flags);
    case 'doctor':
      return commandDoctor();
    case 'ingest':
      return commandIngest(args[0], flags);
    case 'run':
      return commandRun(args[0], flags);
    case 'step':
      return commandStep(args[0], args[1], flags);
    case 'status':
      return commandStatus(args[0], flags);
    case 'jobs':
      return commandJobs(flags);
    case 'artifacts':
      return commandArtifacts(args[0], args[1]);
    case 'quarantine':
      return commandQuarantine(args[0], args.slice(1).join(' '));
    case 'abandon':
      return commandAbandon(args[0]);
    case 'gates':
      return commandGates();
    case 'states':
      return commandStates();
    default:
      fail(`Unknown command "${command}". Run without arguments for help.`);
  }
}

main().catch((error) => {
  if (error instanceof PipelineError) {
    // Expected failure classes get a clean message - a stack trace here
    // would bury the actual problem in noise.
    console.error(color.red(`\n${error.name}: ${error.message}\n`));
    if (process.env.DEBUG) console.error(error.details);
  } else {
    console.error(color.red(`\nUnexpected error: ${error.message}\n`));
    console.error(error.stack);
  }
  process.exit(1);
});
