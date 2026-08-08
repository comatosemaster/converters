// -----------------------------------------------------------------------
// ENVIRONMENT
//
// Loads a .env file from the repo root if one exists, using Node's own
// loadEnvFile - no dotenv dependency needed.
//
// Real environment variables always win over the file, so CI can inject
// a key without anyone having to remember that a committed .env would
// have silently overridden it.
// -----------------------------------------------------------------------

import path from 'node:path';
import { existsSync } from 'node:fs';
import { REPO_ROOT, PIPELINE_ROOT } from '../../config/pipeline.config.js';

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;

  // Repo root first (the conventional place), then the pipeline's own
  // directory as a fallback.
  for (const candidate of [path.join(REPO_ROOT, '.env'), path.join(PIPELINE_ROOT, '.env')]) {
    if (!existsSync(candidate)) continue;

    const before = { ...process.env };
    try {
      process.loadEnvFile(candidate);
    } catch {
      // A malformed .env shouldn't crash the CLI before it can explain
      // itself - the missing-key error downstream is far more useful.
      continue;
    }

    // Restore anything that was already set in the real environment.
    for (const [key, value] of Object.entries(before)) {
      if (value !== undefined) process.env[key] = value;
    }
    break;
  }
}

export function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
