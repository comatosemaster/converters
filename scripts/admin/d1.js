// Runs SQL on the neatsize-db D1 database through wrangler, for the admin
// npm scripts. Remote (production) by default; pass --local to work on the
// local copy `wrangler dev` uses.
//
// Every value is validated by the caller before it gets here, and string
// values are escaped with sqlString() - `wrangler d1 execute --command`
// has no bind parameters.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WRANGLER = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));

export const isLocal = process.argv.includes('--local');
export const args = process.argv.slice(2).filter((arg) => arg !== '--local');

export function sqlString(value) {
  return value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
}

export function runSql(statement) {
  let out;
  try {
    out = execFileSync(
      process.execPath,
      [WRANGLER, 'd1', 'execute', 'neatsize-db', isLocal ? '--local' : '--remote', '--json', '--command', statement],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const detail = `${error.stdout || ''}${error.stderr || ''}`.trim().split('\n').slice(-6).join('\n');
    throw new Error(`wrangler d1 execute failed:\n${detail}`);
  }
  // wrangler may print notices before the JSON.
  const json = out.slice(out.indexOf('['));
  return JSON.parse(json).flatMap((result) => result.results ?? []);
}

export function where() {
  return isLocal ? 'LOCAL database' : 'PRODUCTION database (remote)';
}
