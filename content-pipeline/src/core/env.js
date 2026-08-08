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

const KEY_ENV = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

export function keyEnvFor(provider) {
  return KEY_ENV[provider] ?? `${provider.toUpperCase()}_API_KEY`;
}

// The copied-but-not-filled-in .env is the single most likely setup
// mistake, and checking only that the variable EXISTS reports it as fine
// - so the first real failure arrives later, as a confusing 401 from the
// provider. Cheap to catch here instead.
export function looksLikePlaceholder(value) {
  if (!value) return false;
  return (
    value.includes('...') ||
    value.includes('YOUR_') ||
    value.includes('<') ||
    // Real keys from both providers are far longer than this.
    value.replace(/^sk-(ant-)?/, '').length < 20
  );
}

export function keyStatus(provider) {
  const value = process.env[keyEnvFor(provider)];
  if (!value) return 'missing';
  if (looksLikePlaceholder(value)) return 'placeholder';
  return 'set';
}

export function hasApiKey(provider) {
  return keyStatus(provider) === 'set';
}

/** Providers a tier is configured to use but has no usable key for. */
export function missingKeys(providers) {
  return providers.filter((provider) => !hasApiKey(provider));
}
