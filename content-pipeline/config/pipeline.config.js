// -----------------------------------------------------------------------
// PIPELINE CONFIGURATION
//
// Everything tunable lives here so behaviour can change without editing
// step logic. Steps read config; they never hardcode limits.
// -----------------------------------------------------------------------

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** content-pipeline/ */
export const PIPELINE_ROOT = path.resolve(here, '..');

/** The repository root - i.e. the website. */
export const REPO_ROOT = path.resolve(PIPELINE_ROOT, '..');

export const config = {
  // --- Publication safety -------------------------------------------------
  //
  // Pushing to master auto-deploys to Cloudflare with no staging
  // environment, so publication is the one irreversible action in the
  // system. These caps exist so that a mistyped `--all` cannot turn into
  // forty live articles: a search engine reads a sudden content flood as
  // scaled content abuse, and that damage is slow to undo.
  publish: {
    // Open a pull request instead of committing to master. Turning this
    // off means the pipeline can deploy to production unattended; there
    // is no good reason to do that.
    requirePullRequest: true,
    maxPerRun: 1,
    maxPerDay: 3,
    branchPrefix: 'content/',
    baseBranch: 'master',
  },

  // --- Quality gates ------------------------------------------------------
  //
  // Ordered cheapest-first, and the run stops at the first tier that
  // fails. There is no reason to pay an SEO reviewer to read an article
  // whose frontmatter doesn't parse.
  gates: {
    // Tier 0 - deterministic, free, milliseconds. Always run.
    tier0: ['frontmatter', 'links', 'markdown'],
    // Tier 1 - deterministic, free, seconds.
    tier1: ['dedup', 'prose'],
    // Tier 2+ (SEO, editorial, verification) arrive in phase 3.
    tier2: [],
    // Stop after the first tier that produces a blocking verdict, rather
    // than running everything and reporting a wall of findings that are
    // mostly downstream consequences of the first failure.
    stopAtFirstFailingTier: true,
  },

  // --- Revision budget ----------------------------------------------------
  // Unused until phase 3, but declared now so the shape is fixed and the
  // job schema doesn't change later.
  revisions: {
    maxPerGate: 2,
    maxPerJob: 4,
    // If two consecutive revisions don't improve the score, stop. Past
    // that point the model is oscillating - fixing one gate while
    // regressing another - and further attempts are provably wasted.
    oscillationWindow: 2,
  },

  // --- Cost control -------------------------------------------------------
  // Unused in phase 1 (no LLM calls), enforced from phase 2.
  budget: {
    maxUsdPerJob: 1.5,
    maxUsdPerRun: 10,
  },

  // --- Build verification -------------------------------------------------
  //
  // Vite's binary is invoked directly with the current Node executable
  // rather than through `npm run build`. Two reasons: npm is a .cmd shim
  // on Windows and can only be spawned through a shell (which Node now
  // warns about), and going straight to the binary skips npm's startup
  // overhead on every staged article.
  //
  // `binary` is resolved relative to the repo root.
  build: {
    binary: 'node_modules/vite/bin/vite.js',
    args: ['build'],
    timeoutMs: 5 * 60 * 1000,
  },
};

export default config;
