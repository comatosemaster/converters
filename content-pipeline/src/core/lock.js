// -----------------------------------------------------------------------
// PER-JOB LOCK
//
// Different jobs are different directories and never touch each other, so
// the only contention is two processes advancing the SAME job - e.g. a
// scheduled run overlapping a manual one. That's the case this prevents.
//
// Uses exclusive file creation (`wx`), which is atomic on every platform
// we care about. Stale locks (from a killed process) are detected by
// checking whether the recorded pid is still alive, so a crash doesn't
// require manual cleanup.
// -----------------------------------------------------------------------

import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { jobDir } from './store.js';
import { ContractError } from './errors.js';

function lockPath(jobId) {
  return path.join(jobDir(jobId), '.lock');
}

function processAlive(pid) {
  try {
    // Signal 0 performs the permission/existence check without actually
    // signalling the process.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to another user - still alive.
    return error.code === 'EPERM';
  }
}

async function readLock(jobId) {
  try {
    return JSON.parse(await readFile(lockPath(jobId), 'utf8'));
  } catch {
    return null;
  }
}

export async function acquireLock(jobId) {
  const file = lockPath(jobId);
  await mkdir(path.dirname(file), { recursive: true });

  const payload = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });

  try {
    await writeFile(file, payload, { flag: 'wx' });
    return;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  // The lock exists. If the owner is gone, it's stale - take it over.
  const existing = await readLock(jobId);
  if (!existing || !existing.pid || !processAlive(existing.pid)) {
    await writeFile(file, payload);
    return;
  }

  throw new ContractError(
    `Job "${jobId}" is locked by a running process (pid ${existing.pid}, since ${existing.at}).`,
    { jobId, holder: existing },
  );
}

export async function releaseLock(jobId) {
  try {
    await unlink(lockPath(jobId));
  } catch {
    // Already released, or never acquired. Releasing twice is not an error.
  }
}

// Runs `fn` holding the job's lock, releasing it even if `fn` throws.
// Every step goes through this, so no step can forget to release.
export async function withLock(jobId, fn) {
  await acquireLock(jobId);
  try {
    return await fn();
  } finally {
    await releaseLock(jobId);
  }
}
