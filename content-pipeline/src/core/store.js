// -----------------------------------------------------------------------
// PERSISTENCE
//
// Deliberately an interface over the filesystem rather than direct fs
// calls scattered through the steps. At this volume (a handful of
// articles a day) the filesystem beats a database on every axis that
// matters: inspectable with `ls` and `cat`, diffable, zero-ops, and it
// survives a crash mid-run with no recovery procedure.
//
// If volume ever justifies Postgres or a queue, this is the only module
// that changes.
//
// Every write is atomic: write to a temp file, fsync, rename. A crash
// mid-write must never leave a truncated artifact that looks complete to
// the next step.
// -----------------------------------------------------------------------

import { mkdir, readFile, writeFile, rename, readdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PIPELINE_ROOT } from '../../config/pipeline.config.js';

export const DATA_DIR = path.join(PIPELINE_ROOT, 'data');
export const JOBS_DIR = path.join(DATA_DIR, 'jobs');
export const STAGING_DIR = path.join(DATA_DIR, 'staging');
export const REPORTS_DIR = path.join(DATA_DIR, 'reports');

export function jobDir(jobId) {
  return path.join(JOBS_DIR, jobId);
}

export function artifactsDir(jobId) {
  return path.join(jobDir(jobId), 'artifacts');
}

export async function ensureDirs(jobId) {
  await mkdir(artifactsDir(jobId), { recursive: true });
}

export async function ensureDataDirs() {
  await mkdir(JOBS_DIR, { recursive: true });
  await mkdir(STAGING_DIR, { recursive: true });
  await mkdir(REPORTS_DIR, { recursive: true });
}

export async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Atomic write: temp file in the same directory (so rename can't cross a
// filesystem boundary), then rename over the target.
export async function writeFileAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tempPath, contents, 'utf8');
  await rename(tempPath, filePath);
}

export async function writeJsonAtomic(filePath, value) {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

// --- Artifacts ------------------------------------------------------------
//
// Artifacts are append-only: a step never mutates one produced earlier.
// `edit` reads draft.json and writes edited.json; revision N writes
// edited.v2.json. Disk is free; lost provenance is not - being able to
// diff exactly what a revision changed is what makes quality regressions
// debuggable rather than mysterious.

export async function writeArtifact(jobId, name, value) {
  const filePath = path.join(artifactsDir(jobId), name);
  if (typeof value === 'string') await writeFileAtomic(filePath, value);
  else await writeJsonAtomic(filePath, value);
  return filePath;
}

export async function readArtifact(jobId, name) {
  const filePath = path.join(artifactsDir(jobId), name);
  return name.endsWith('.json') ? readJson(filePath) : readText(filePath);
}

export async function hasArtifact(jobId, name) {
  return exists(path.join(artifactsDir(jobId), name));
}

export async function listArtifacts(jobId) {
  try {
    return (await readdir(artifactsDir(jobId))).sort();
  } catch {
    return [];
  }
}

// Picks the highest-numbered version of an artifact, e.g. given
// edited.json / edited.v2.json / edited.v3.json returns edited.v3.json.
// Steps use this so they always read the newest revision without needing
// to track version numbers themselves.
export async function latestArtifact(jobId, baseName) {
  const stem = baseName.replace(/\.json$/, '');
  const files = await listArtifacts(jobId);
  const versioned = files
    .map((file) => {
      if (file === `${stem}.json`) return { file, version: 1 };
      const match = file.match(new RegExp(`^${stem}\\.v(\\d+)\\.json$`));
      return match ? { file, version: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.version - a.version);
  return versioned[0]?.file ?? null;
}

// --- Jobs -----------------------------------------------------------------

export async function listJobIds() {
  try {
    const entries = await readdir(JOBS_DIR, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export async function deleteJob(jobId) {
  await rm(jobDir(jobId), { recursive: true, force: true });
}
