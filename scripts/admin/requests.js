#!/usr/bin/env node
// -----------------------------------------------------------------------
// "Request a Tool" admin - command line only, no admin UI.
//
//   npm run requests                         list new + planned requests
//   npm run requests -- --all                list every request
//   npm run request:status -- <id> planned   (or rejected, or new)
//   npm run request:ship -- <id> <tool-slug> mark shipped; the requester
//                                            hears about it in their next
//                                            weekly digest (if subscribed)
//
// Add --local to any of them to use the local `wrangler dev` database.
// -----------------------------------------------------------------------

import { readRegistry } from '../lib/registryData.js';
import { args, runSql, sqlString, where } from './d1.js';

const [command, ...rest] = args;

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    console.error(`"${value ?? ''}" is not a request id (a positive whole number).`);
    process.exit(1);
  }
  return id;
}

function requestRow(id) {
  const [row] = runSql(`SELECT id, status, description FROM tool_requests WHERE id = ${id}`);
  if (!row) {
    console.error(`No request with id ${id} in the ${where()}.`);
    process.exit(1);
  }
  return row;
}

const clip = (text, length) => (text && text.length > length ? `${text.slice(0, length - 1)}…` : text ?? '');

function list(all) {
  const rows = runSql(`
    SELECT r.id, r.status, substr(r.created_at, 1, 10) AS created, r.description, r.details,
           r.email, s.status AS subscription, r.shipped_slug, r.notified_at
      FROM tool_requests r LEFT JOIN subscribers s ON s.id = r.subscriber_id
     ${all ? '' : "WHERE r.status IN ('new', 'planned')"}
     ORDER BY CASE r.status WHEN 'new' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, r.created_at`);
  console.log(`${rows.length} ${all ? '' : 'new/planned '}request(s) in the ${where()}:\n`);
  for (const row of rows) {
    console.log(`#${row.id}  [${row.status}]  ${row.created}${row.shipped_slug ? `  -> /tool/${row.shipped_slug}` : ''}`);
    console.log(`  ${clip(row.description, 300)}`);
    if (row.details) console.log(`  Details: ${clip(row.details, 200)}`);
    if (row.email) {
      const note = row.subscription ? `wants a heads-up (${row.subscription})` : 'no heads-up requested';
      console.log(`  Email: ${row.email} - ${note}`);
    }
    if (row.notified_at) console.log(`  Told it shipped: ${row.notified_at}`);
    console.log('');
  }
}

function setStatus(idArg, status) {
  const id = parseId(idArg);
  if (!['new', 'planned', 'rejected'].includes(status)) {
    console.error('Status must be planned, rejected or new. (Use request:ship to mark one shipped.)');
    process.exit(1);
  }
  const row = requestRow(id);
  runSql(`UPDATE tool_requests SET status = ${sqlString(status)} WHERE id = ${id}`);
  console.log(`#${id} ${row.status} -> ${status} (${where()}): ${clip(row.description, 80)}`);
}

async function ship(idArg, slug) {
  const id = parseId(idArg);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '')) {
    console.error(`"${slug ?? ''}" is not a tool slug - use the id from the tool's URL, e.g. pdf-split for /tool/pdf-split.`);
    process.exit(1);
  }
  const { toolIds } = await readRegistry();
  if (!toolIds.has(slug)) {
    console.error(`No tool "${slug}" in src/tools/registry.js. Add and deploy the tool first, so the link in the email works.`);
    process.exit(1);
  }
  const row = requestRow(id);
  runSql(`UPDATE tool_requests SET status = 'shipped', shipped_slug = ${sqlString(slug)} WHERE id = ${id}`);
  console.log(`#${id} ${row.status} -> shipped as /tool/${slug} (${where()}).`);
  console.log('If the requester asked to be emailed, their next weekly digest leads with it.');
}

try {
  if (command === 'list') list(rest.includes('--all'));
  else if (command === 'status') setStatus(rest[0], rest[1]);
  else if (command === 'ship') await ship(rest[0], rest[1]);
  else {
    console.error('Usage: npm run requests | request:status -- <id> planned|rejected|new | request:ship -- <id> <tool-slug>  [--local]');
    process.exit(1);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
