import { describe, expect, it } from 'vitest';
import type { Db } from '../db/index.js';
import { makeTestApp, signup } from './helpers.js';

function attachmentFtsIds(db: Db, match: string): number[] {
  return (
    db.$client
      .prepare('SELECT rowid FROM attachment_fts WHERE attachment_fts MATCH ?')
      .all(match) as { rowid: number }[]
  ).map((row) => row.rowid);
}

describe('attachment_fts stays in sync via triggers', () => {
  it('indexes extracted text on update and de-indexes on delete', async () => {
    const { app, db } = makeTestApp();
    await signup(app, 'nemo');
    db.$client
      .prepare(
        "INSERT INTO attachment (uid, creator_id, filename, type, size, storage_path) VALUES ('att1', 1, 'pic.png', 'image/png', 10, 'assets/pic.png')",
      )
      .run();
    db.$client
      .prepare("UPDATE attachment SET extracted_text = 'RECEIPT total 42' WHERE uid = 'att1'")
      .run();
    expect(attachmentFtsIds(db, '"receipt"')).toHaveLength(1);
    db.$client.prepare("DELETE FROM attachment WHERE uid = 'att1'").run();
    expect(attachmentFtsIds(db, '"receipt"')).toHaveLength(0);
  });
});
