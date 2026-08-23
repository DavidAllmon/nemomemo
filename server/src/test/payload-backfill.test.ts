import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDb } from '../db/index.js';

describe('boot payload backfill', () => {
  it('rewrites payloads missing the incomplete-task count, leaving content and FTS alone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-backfill-'));
    const file = path.join(dir, 'reef.db');

    const first = createDb(file);
    first.$client
      .prepare("INSERT INTO user (username, password_hash, email) VALUES ('nemo', 'x', 'n@test.reef')")
      .run();
    // Simulate a pre-v1.17 row: payload has the old shape without the count.
    first.$client
      .prepare(
        `INSERT INTO memo (uid, creator_id, content, payload) VALUES ('old', 1, '- [ ] a
- [ ] b', '{"tags":[],"property":{"hasLink":false,"hasCode":false,"hasTaskList":true,"hasIncompleteTasks":true}}')`,
      )
      .run();
    first.$client.close();

    const reopened = createDb(file);
    const row = reopened.$client
      .prepare(
        "SELECT content, json_extract(payload, '$.property.incompleteTasks') AS n FROM memo WHERE uid = 'old'",
      )
      .get() as { content: string; n: number };
    expect(row.n).toBe(2);
    expect(row.content).toBe('- [ ] a\n- [ ] b');
    // The FTS index (synced by content triggers) must be untouched but intact.
    const fts = reopened.$client
      .prepare('SELECT count(*) AS n FROM memo_fts WHERE memo_fts MATCH \'"a"\'')
      .get() as { n: number };
    expect(fts.n).toBe(1);
    reopened.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
