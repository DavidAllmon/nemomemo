import { describe, expect, it } from 'vitest';
import type { MemoDto, MemoHistoryResponse } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

type App = Parameters<typeof jsonRequest>[0];
type Db = ReturnType<typeof makeTestApp>['db'];

const now = () => Math.floor(Date.now() / 1000);

async function bulk(
  app: App,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ status: number; affected?: number }> {
  const response = await jsonRequest(app, 'POST', '/api/v1/memos/bulk', body, cookie);
  const json = response.status === 200 ? ((await response.json()) as { affected: number }) : null;
  return { status: response.status, affected: json?.affected };
}

async function readMemo(app: App, cookie: string, uid: string): Promise<MemoDto> {
  const response = await jsonRequest(app, 'GET', `/api/v1/memos/${uid}`, undefined, cookie);
  expect(response.status).toBe(200);
  return ((await response.json()) as { memo: MemoDto }).memo;
}

describe('bulk actions — archive & unarchive', () => {
  it('archives several memos at once and rescues Dory ones', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const plain = await createMemo(app, cookie, { content: 'plain' });
    const fading = await createMemo(app, cookie, { content: 'fading', dory: true, doryWindow: '7d' });
    const { status, affected } = await bulk(app, cookie, {
      uids: [plain.uid, fading.uid],
      action: 'archive',
    });
    expect(status).toBe(200);
    expect(affected).toBe(2);
    const rows = db.$client
      .prepare('SELECT row_status, forget_at FROM memo ORDER BY id')
      .all() as { row_status: string; forget_at: number | null }[];
    expect(rows.map((r) => r.row_status)).toEqual(['ARCHIVED', 'ARCHIVED']);
    expect(rows[1]!.forget_at).toBeNull();
  });

  it('skips already-archived memos, and unarchive brings them back', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'boomerang' });
    expect((await bulk(app, cookie, { uids: [memo.uid], action: 'archive' })).affected).toBe(1);
    expect((await bulk(app, cookie, { uids: [memo.uid], action: 'archive' })).affected).toBe(0);
    expect((await bulk(app, cookie, { uids: [memo.uid], action: 'unarchive' })).affected).toBe(1);
    expect((await readMemo(app, cookie, memo.uid)).rowStatus).toBe('NORMAL');
  });

  it("silently skips other members' memos", async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    const dory = await signup(app, 'dory');
    const theirs = await createMemo(app, dory, { content: 'not yours', visibility: 'PUBLIC' });
    const mine = await createMemo(app, marlin, { content: 'mine' });
    const { affected } = await bulk(app, marlin, { uids: [theirs.uid, mine.uid], action: 'archive' });
    expect(affected).toBe(1);
    expect((await readMemo(app, dory, theirs.uid)).rowStatus).toBe('NORMAL');
  });
});

describe('bulk actions — trash', () => {
  it('sends memos and their comments to the trash together', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'parent', visibility: 'PUBLIC' });
    await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/comments`, { content: 'a comment' }, cookie);
    const { affected } = await bulk(app, cookie, { uids: [memo.uid], action: 'trash' });
    expect(affected).toBe(1);
    const marked = db.$client
      .prepare('SELECT COUNT(*) AS n FROM memo WHERE deleted_at IS NOT NULL')
      .get() as { n: number };
    expect(marked.n).toBe(2);
  });

  it('re-trashing keeps the original clock', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'doomed' });
    const then = now() - 1000;
    db.$client.prepare('UPDATE memo SET deleted_at = ? WHERE uid = ?').run(then, memo.uid);
    const { affected } = await bulk(app, cookie, { uids: [memo.uid], action: 'trash' });
    expect(affected).toBe(0);
    const row = db.$client
      .prepare('SELECT deleted_at FROM memo WHERE uid = ?')
      .get(memo.uid) as { deleted_at: number };
    expect(row.deleted_at).toBe(then);
  });
});

describe('bulk actions — tag', () => {
  it('appends the tag, rebuilds payload, and captures a revision per memo', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const a = await createMemo(app, cookie, { content: 'first note' });
    const b = await createMemo(app, cookie, { content: 'second note' });
    const { affected } = await bulk(app, cookie, { uids: [a.uid, b.uid], action: 'tag', tag: 'reef' });
    expect(affected).toBe(2);
    const after = await readMemo(app, cookie, a.uid);
    expect(after.content).toBe('first note\n\n#reef');
    expect(after.tags).toEqual(['reef']);
    const history = await jsonRequest(app, 'GET', `/api/v1/memos/${a.uid}/history`, undefined, cookie);
    const { revisions } = (await history.json()) as MemoHistoryResponse;
    expect(revisions.map((r) => r.content)).toEqual(['first note']);
  });

  it('skips memos already carrying the tag — implied ancestors included — without a revision', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const direct = await createMemo(app, cookie, { content: 'has #reef already' });
    const nested = await createMemo(app, cookie, { content: 'nested #reef/notes here' });
    const { affected } = await bulk(app, cookie, {
      uids: [direct.uid, nested.uid],
      action: 'tag',
      tag: 'reef',
    });
    expect(affected).toBe(0);
    const history = await jsonRequest(app, 'GET', `/api/v1/memos/${direct.uid}/history`, undefined, cookie);
    expect(((await history.json()) as MemoHistoryResponse).revisions).toHaveLength(0);
  });

  it('rejects a missing or malformed tag', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'x' });
    expect((await bulk(app, cookie, { uids: [memo.uid], action: 'tag' })).status).toBe(400);
    expect((await bulk(app, cookie, { uids: [memo.uid], action: 'tag', tag: 'a//b' })).status).toBe(400);
  });
});

describe('bulk actions — guardrails', () => {
  it('caps the batch at 100 uids', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const uids = Array.from({ length: 101 }, (_, i) => `uid-${i}`);
    expect((await bulk(app, cookie, { uids, action: 'archive' })).status).toBe(400);
  });

  it('skips trashed and Dory-expired memos for archive and tag', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const trashed = await createMemo(app, cookie, { content: 'binned' });
    const expired = await createMemo(app, cookie, { content: 'forgotten' });
    db.$client.prepare('UPDATE memo SET deleted_at = ? WHERE uid = ?').run(now(), trashed.uid);
    db.$client.prepare('UPDATE memo SET forget_at = ? WHERE uid = ?').run(now() - 10, expired.uid);
    expect(
      (await bulk(app, cookie, { uids: [trashed.uid, expired.uid], action: 'archive' })).affected,
    ).toBe(0);
    expect(
      (await bulk(app, cookie, { uids: [trashed.uid, expired.uid], action: 'tag', tag: 'reef' })).affected,
    ).toBe(0);
  });

  it('requires a signed-in member', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'POST', '/api/v1/memos/bulk', {
      uids: ['whatever'],
      action: 'archive',
    });
    expect(response.status).toBe(401);
  });
});
