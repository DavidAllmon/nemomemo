import { describe, expect, it } from 'vitest';
import type { Db } from '../db/index.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

function ftsIds(db: Db, match: string): number[] {
  return (
    db.$client.prepare('SELECT rowid FROM memo_fts WHERE memo_fts MATCH ?').all(match) as {
      rowid: number;
    }[]
  ).map((row) => row.rowid);
}

describe('memo_fts stays in sync via triggers', () => {
  it('indexes new memos via the insert trigger', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await createMemo(app, cookie, { content: 'anemone home' });
    expect(ftsIds(db, '"anemone"')).toHaveLength(1);
  });

  it('re-indexes on content update and de-indexes on delete', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'barnacle' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'kelp forest' }, cookie);
    expect(ftsIds(db, '"barnacle"')).toHaveLength(0);
    expect(ftsIds(db, '"kelp"')).toHaveLength(1);
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    expect(ftsIds(db, '"kelp"')).toHaveLength(0);
  });
});
