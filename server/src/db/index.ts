import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backfillPayloads } from './backfill.js';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Bundled migrations, ordered by filename. Kept tiny on purpose (greenfield app). */
function loadMigrations(): { name: string; sql: string }[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({ name: file, sql: fs.readFileSync(path.join(migrationsDir, file), 'utf8') }));
}

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT NOT NULL UNIQUE, applied_ts BIGINT NOT NULL)',
  );
  const applied = new Set(
    (sqlite.prepare('SELECT name FROM schema_migration').all() as { name: string }[]).map(
      (row) => row.name,
    ),
  );
  for (const migration of loadMigrations()) {
    if (applied.has(migration.name)) continue;
    const apply = sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      sqlite
        .prepare('INSERT INTO schema_migration (name, applied_ts) VALUES (?, ?)')
        .run(migration.name, Math.floor(Date.now() / 1000));
    });
    apply();
  }
}

export function createDb(filename: string): Db {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  runMigrations(sqlite);
  const rewritten = backfillPayloads(sqlite);
  if (rewritten > 0) console.log(`[db] payload backfill rewrote ${rewritten} memos`);
  return drizzle(sqlite, { schema }) as Db;
}

export { schema };
