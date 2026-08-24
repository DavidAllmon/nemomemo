import { describe, expect, it } from 'vitest';
import type { MemoDto, MemoHistoryResponse } from '@nemomemo/shared';
import { REVISION_KEEP_COUNT, REVISION_RETENTION_SECONDS } from '@nemomemo/shared';
import { runSchedulerTick } from '../services/scheduler.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

type Db = ReturnType<typeof makeTestApp>['db'];

const now = () => Math.floor(Date.now() / 1000);

function revisionRows(db: Db, uid: string): { content: string; created_ts: number }[] {
  return db.$client
    .prepare(
      `SELECT r.content, r.created_ts FROM memo_revision r
       JOIN memo ON memo.id = r.memo_id WHERE memo.uid = ?
       ORDER BY r.created_ts DESC, r.id DESC`,
    )
    .all(uid) as { content: string; created_ts: number }[];
}

describe('edit history — every content edit keeps the words it replaced', () => {
  it('a content edit writes one revision holding the prior content', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'first draft' });
    const response = await jsonRequest(
      app,
      'PATCH',
      `/api/v1/memos/${memo.uid}`,
      { content: 'second draft' },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(revisionRows(db, memo.uid).map((r) => r.content)).toEqual(['first draft']);
  });

  it('two edits stack newest-first', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'v1' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'v2' }, cookie);
    // Same-second edits: order falls back to id, so v2 still lands first.
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'v3' }, cookie);
    expect(revisionRows(db, memo.uid).map((r) => r.content)).toEqual(['v2', 'v1']);
  });

  it('saving identical content writes no revision', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'unchanged' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'unchanged' }, cookie);
    expect(revisionRows(db, memo.uid)).toHaveLength(0);
  });

  it('non-content edits (pin, visibility, archive) write no revision', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'curated' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { pinned: true }, cookie);
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { visibility: 'PUBLIC' }, cookie);
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { rowStatus: 'ARCHIVED' }, cookie);
    expect(revisionRows(db, memo.uid)).toHaveLength(0);
  });

  it('permanent delete purges revisions with the memo (FK cascade)', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'doomed v1' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'doomed v2' }, cookie);
    expect(revisionRows(db, memo.uid)).toHaveLength(1);
    const response = await jsonRequest(
      app,
      'DELETE',
      `/api/v1/memos/${memo.uid}?permanent=1`,
      undefined,
      cookie,
    );
    expect(response.status).toBe(200);
    const orphans = db.$client.prepare('SELECT COUNT(*) AS n FROM memo_revision').get() as { n: number };
    expect(orphans.n).toBe(0);
  });
});

describe('edit history — reading and restoring', () => {
  async function history(app: ReturnType<typeof makeTestApp>['app'], uid: string, cookie?: string) {
    return jsonRequest(app, 'GET', `/api/v1/memos/${uid}/history`, undefined, cookie);
  }

  it('the creator reads revisions newest-first', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'v1' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'v2' }, cookie);
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'v3' }, cookie);
    const response = await history(app, memo.uid, cookie);
    expect(response.status).toBe(200);
    const json = (await response.json()) as MemoHistoryResponse;
    expect(json.revisions.map((r) => r.content)).toEqual(['v2', 'v1']);
    expect(json.revisions[0]!.createdTs).toBeGreaterThan(0);
  });

  it('another signed-in member cannot read history, even on a PUBLIC memo', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const other = await signup(app, 'dory');
    const memo = await createMemo(app, cookie, { content: 'v1', visibility: 'PUBLIC' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'v2' }, cookie);
    expect((await history(app, memo.uid, other)).status).toBe(403);
  });

  it('signed-out visitors get 401', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'v1', visibility: 'PUBLIC' });
    expect((await history(app, memo.uid)).status).toBe(401);
  });

  it('a trashed memo hides its history from its own creator', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'v1' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'v2' }, cookie);
    db.$client.prepare('UPDATE memo SET deleted_at = ? WHERE uid = ?').run(now(), memo.uid);
    expect((await history(app, memo.uid, cookie)).status).toBe(404);
  });

  it('an expired Dory memo hides its history', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'v1' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'v2' }, cookie);
    db.$client.prepare('UPDATE memo SET forget_at = ? WHERE uid = ?').run(now() - 10, memo.uid);
    expect((await history(app, memo.uid, cookie)).status).toBe(404);
  });

  it('restore swaps content back, keeps the pre-restore words as a revision, and rebuilds payload', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'notes #reef' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'notes #kelp' }, cookie);
    const revisions = ((await (await history(app, memo.uid, cookie)).json()) as MemoHistoryResponse).revisions;
    const response = await jsonRequest(
      app,
      'POST',
      `/api/v1/memos/${memo.uid}/history/${revisions[0]!.id}/restore`,
      undefined,
      cookie,
    );
    expect(response.status).toBe(200);
    const { memo: restored } = (await response.json()) as { memo: MemoDto };
    expect(restored.content).toBe('notes #reef');
    expect(restored.tags).toEqual(['reef']);
    // The kelp era is preserved as the newest revision — nothing is ever lost.
    expect(revisionRows(db, memo.uid).map((r) => r.content)).toEqual(['notes #kelp', 'notes #reef']);
  });

  it('only the creator can restore', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const other = await signup(app, 'dory');
    const memo = await createMemo(app, cookie, { content: 'v1', visibility: 'PUBLIC' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'v2' }, cookie);
    const revisions = (
      (await (await jsonRequest(app, 'GET', `/api/v1/memos/${memo.uid}/history`, undefined, cookie)).json()) as MemoHistoryResponse
    ).revisions;
    const response = await jsonRequest(
      app,
      'POST',
      `/api/v1/memos/${memo.uid}/history/${revisions[0]!.id}/restore`,
      undefined,
      other,
    );
    expect(response.status).toBe(403);
  });

  it("a revision id from someone else's memo is NOT_FOUND", async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const mine = await createMemo(app, cookie, { content: 'mine v1' });
    const theirs = await createMemo(app, cookie, { content: 'other v1' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${theirs.uid}`, { content: 'other v2' }, cookie);
    const revisions = (
      (await (await jsonRequest(app, 'GET', `/api/v1/memos/${theirs.uid}/history`, undefined, cookie)).json()) as MemoHistoryResponse
    ).revisions;
    const response = await jsonRequest(
      app,
      'POST',
      `/api/v1/memos/${mine.uid}/history/${revisions[0]!.id}/restore`,
      undefined,
      cookie,
    );
    expect(response.status).toBe(404);
  });

  it('restoring content identical to the current memo adds no revision', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'same' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'different' }, cookie);
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'same' }, cookie);
    const revisions = (
      (await (await jsonRequest(app, 'GET', `/api/v1/memos/${memo.uid}/history`, undefined, cookie)).json()) as MemoHistoryResponse
    ).revisions;
    const sameRevision = revisions.find((r) => r.content === 'same')!;
    await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/history/${sameRevision.id}/restore`, undefined, cookie);
    expect(revisionRows(db, memo.uid)).toHaveLength(2);
  });
});

describe('edit history — the scheduler prunes', () => {
  it(`keeps only the newest ${REVISION_KEEP_COUNT} revisions per memo`, async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'v0' });
    const memoId = (db.$client.prepare('SELECT id FROM memo WHERE uid = ?').get(memo.uid) as { id: number }).id;
    const insert = db.$client.prepare(
      'INSERT INTO memo_revision (memo_id, content, created_ts) VALUES (?, ?, ?)',
    );
    const base = now() - 1000;
    for (let i = 0; i < REVISION_KEEP_COUNT + 5; i++) insert.run(memoId, `v${i}`, base + i);
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    expect(result.revisionsPruned).toBe(5);
    const kept = revisionRows(db, memo.uid);
    expect(kept).toHaveLength(REVISION_KEEP_COUNT);
    // The oldest five (v0..v4) are the ones that went.
    expect(kept[kept.length - 1]!.content).toBe('v5');
  });

  it('ages out revisions older than the retention window', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'v0' });
    const memoId = (db.$client.prepare('SELECT id FROM memo WHERE uid = ?').get(memo.uid) as { id: number }).id;
    const insert = db.$client.prepare(
      'INSERT INTO memo_revision (memo_id, content, created_ts) VALUES (?, ?, ?)',
    );
    insert.run(memoId, 'ancient', now() - REVISION_RETENTION_SECONDS - 60);
    insert.run(memoId, 'recent', now() - 60);
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    expect(result.revisionsPruned).toBe(1);
    expect(revisionRows(db, memo.uid).map((r) => r.content)).toEqual(['recent']);
  });
});
