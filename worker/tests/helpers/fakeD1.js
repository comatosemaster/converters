// A small D1-compatible wrapper around Node's built-in SQLite (node:sqlite,
// Node 22.5+), loaded with the real migrations. Lets the unit tests run
// the Worker's actual SQL - same engine as D1 - with no extra packages.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../migrations');

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }

  // async, like D1: an SQL error becomes a rejected promise, not a throw.
  async first() {
    const row = this.db.prepare(this.sql).get(...this.params);
    return row ? { ...row } : null;
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params).map((row) => ({ ...row })), success: true };
  }

  async run() {
    // RETURNING statements still have to be read with all() in node:sqlite.
    if (/\bRETURNING\b/i.test(this.sql)) {
      const rows = this.db.prepare(this.sql).all(...this.params);
      return { success: true, meta: { changes: rows.length }, results: rows };
    }
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

export function createFakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    exec: (sql) => Promise.resolve(db.exec(sql)),
  };
}
