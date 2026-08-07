// -----------------------------------------------------------------------
// STEP: publish
//
// Deliberately the dumbest step in the system. It performs no judgement -
// every judgement already happened upstream, where it is testable and
// reviewable. This step only moves bytes into git.
//
// It opens a PULL REQUEST rather than committing to master, because this
// repo auto-deploys from master via Cloudflare: a commit is a live
// publish with no staging environment and no undo. A human merge costs
// about thirty seconds and converts the system's worst failure mode from
// "unreviewed content on a production domain" into "a PR someone closes".
//
// The rate caps below are the second half of that protection. A search
// engine reads a sudden flood of new pages as scaled content abuse, and
// that damage is slow to undo - so a mistyped `--all` must not be able to
// become forty live articles.
// -----------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { loadJob, transition } from '../core/job.js';
import { assertCanRun } from '../core/machine.js';
import { EVENTS } from '../core/events.js';
import { listJobs } from '../core/job.js';
import { config, REPO_ROOT } from '../../config/pipeline.config.js';
import { articlePath } from '../adapters/site.js';
import { BudgetError, ExternalError } from '../core/errors.js';

export const name = 'publish';

// Deliberately NOT `shell: true`.
//
// Article titles reach this function as git commit message arguments, and
// they're arbitrary text from a markdown file that a model will be
// writing from phase 2 onward. Under a shell, arguments are concatenated
// into a command string rather than escaped, so a title containing shell
// metacharacters would be executed rather than committed.
//
// `git` and `gh` are real executables, so they spawn fine without a
// shell on every platform, and arguments are passed through untouched.
function exec(command, args, { cwd = REPO_ROOT } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => resolve({ ok: false, code: null, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

async function git(args) {
  const result = await exec('git', args);
  if (!result.ok) {
    throw new ExternalError(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`, { args, result });
  }
  return result;
}

// Counts articles already published today, from job records rather than
// git history - the pipeline should only ever rate-limit ITSELF, never
// count articles a human wrote and pushed by hand.
async function publishedToday() {
  const today = new Date().toISOString().slice(0, 10);
  const jobs = await listJobs();
  return jobs.filter((job) => job.state === 'published' && job.publish?.at?.startsWith(today)).length;
}

async function assertCanPublish() {
  const alreadyToday = await publishedToday();
  if (alreadyToday >= config.publish.maxPerDay) {
    throw new BudgetError(
      `Daily publish cap reached (${alreadyToday}/${config.publish.maxPerDay}). This cap exists so a sudden flood of new pages can't read as scaled content abuse - raise it in config/pipeline.config.js if you genuinely mean to.`,
      { alreadyToday, cap: config.publish.maxPerDay },
    );
  }
}

async function ensureGhAvailable() {
  const result = await exec('gh', ['--version']);
  if (!result.ok) {
    throw new ExternalError(
      'The GitHub CLI (`gh`) is required to open a pull request. Install it and run `gh auth login`, or pass --no-pr to commit to a branch without opening one.',
      {},
    );
  }
}

export async function run(jobId, { noPr = false, dryRun = false } = {}) {
  const job = await loadJob(jobId);
  assertCanRun(name, job);
  await EVENTS.stepStarted(job.id, { step: name });

  const slug = job.slug;
  const relativePath = articlePath(slug).replace(`${REPO_ROOT}\\`, '').replace(`${REPO_ROOT}/`, '');
  const branch = `${config.publish.branchPrefix}${slug}`;

  // The article must still be on disk from the stage step - if it isn't,
  // something removed it between staging and publishing and we should not
  // guess.
  const status = await exec('git', ['status', '--porcelain', '--', relativePath]);
  if (!status.stdout) {
    throw new ExternalError(
      `Nothing to commit at ${relativePath}. The staged article is missing or already committed.`,
      { relativePath },
    );
  }

  // A dry run touches nothing, so it deliberately checks nothing that
  // only matters to a real publish - no rate cap consumed, no `gh`
  // required. Its whole purpose is to be safe to run at any time.
  if (dryRun) {
    return { job, ok: true, dryRun: true, branch, relativePath };
  }

  await assertCanPublish();
  if (config.publish.requirePullRequest && !noPr) await ensureGhAvailable();

  const originalBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout;

  try {
    await git(['checkout', '-b', branch]);
    await git(['add', '--', relativePath]);
    await git([
      'commit',
      '-m',
      `Add blog article: ${job.title ?? slug}`,
      '-m',
      [
        `Slug: ${slug}`,
        `Pipeline job: ${job.id}`,
        '',
        'Produced by the content pipeline and passed every configured quality',
        'gate, including a full site build with the article in place.',
      ].join('\n'),
    ]);

    let prUrl = null;
    if (config.publish.requirePullRequest && !noPr) {
      await git(['push', '-u', 'origin', branch]);
      const pr = await exec('gh', [
        'pr',
        'create',
        '--base',
        config.publish.baseBranch,
        '--head',
        branch,
        '--title',
        `Add blog article: ${job.title ?? slug}`,
        '--body',
        [
          `Adds \`${relativePath}\`.`,
          '',
          '| | |',
          '| --- | --- |',
          `| Slug | \`${slug}\` |`,
          `| Job | \`${job.id}\` |`,
          `| Gates | all passed |`,
          `| Build | verified with the article in place |`,
          '',
          'Merging deploys this to production.',
        ].join('\n'),
      ]);

      if (!pr.ok) {
        throw new ExternalError(`gh pr create failed: ${pr.stderr || pr.stdout}`, { pr });
      }
      prUrl = pr.stdout.split('\n').find((line) => line.startsWith('http')) ?? null;
    }

    // Return to where we started so the working tree is left as found.
    await git(['checkout', originalBranch]);

    await transition(job, 'published', {
      publish: { branch, prUrl: prUrl ?? undefined, at: new Date().toISOString() },
    });
    await EVENTS.published(job.id, { branch, prUrl });

    return { job, ok: true, branch, prUrl };
  } catch (error) {
    // Get back to the original branch so a failure doesn't strand the
    // working tree on a half-built content branch.
    await exec('git', ['checkout', originalBranch]);
    await EVENTS.stepFailed(job.id, { step: name, error: error.message });
    throw error;
  }
}
