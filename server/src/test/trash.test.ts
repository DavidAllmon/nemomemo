import { describe, expect, it } from 'vitest';
import type { MemoDto, MemoListResponse, UserStatsDto } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

type App = Parameters<typeof jsonRequest>[0];
type Db = ReturnType<typeof makeTestApp>['db'];

const now = () => Math.floor(Date.now() / 1000);

/** Put a memo in the trash directly — the routes arrive in the next task. */
function trash(db: Db, uid: string, at = now()): void {
  db.$client.prepare('UPDATE memo SET deleted_at = ? WHERE uid = ?').run(at, uid);
}

async function list(app: App, query: string, cookie?: string): Promise<MemoDto[]> {
  const response = await jsonRequest(app, 'GET', `/api/v1/memos?${query}`, undefined, cookie);
  expect(response.status).toBe(200);
  return ((await response.json()) as MemoListResponse).memos;
}

describe('trash — a deleted memo is gone from every read path', () => {
  it('leaves its creator\'s own feed', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const keeper = await createMemo(app, cookie, { content: 'still here' });
    const doomed = await createMemo(app, cookie, { content: 'in the bin' });
    trash(db, doomed.uid);
    expect((await list(app, 'scope=home', cookie)).map((m) => m.uid)).toEqual([keeper.uid]);
  });

  it('leaves the explore feed, signed in and anonymous', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const other = await signup(app, 'dory');
    const doomed = await createMemo(app, cookie, { content: 'public bin', visibility: 'PUBLIC' });
    trash(db, doomed.uid);
    expect(await list(app, 'scope=explore', other)).toHaveLength(0);
    expect(await list(app, 'scope=explore')).toHaveLength(0);
  });

  it('leaves a profile feed', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const doomed = await createMemo(app, cookie, { content: 'profile bin', visibility: 'PUBLIC' });
    trash(db, doomed.uid);
    expect(await list(app, 'scope=profile&creator=marlin', cookie)).toHaveLength(0);
  });

  it('leaves the archived list', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const doomed = await createMemo(app, cookie, { content: 'archived bin' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${doomed.uid}`, { rowStatus: 'ARCHIVED' }, cookie);
    trash(db, doomed.uid);
    expect(await list(app, 'state=ARCHIVED', cookie)).toHaveLength(0);
  });

  it('404s on its own permalink — even for its author', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const doomed = await createMemo(app, cookie, { content: 'gone' });
    trash(db, doomed.uid);
    const response = await jsonRequest(app, 'GET', `/api/v1/memos/${doomed.uid}`, undefined, cookie);
    expect(response.status).toBe(404);
  });

  it('is not resurrected by a share token', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const doomed = await createMemo(app, cookie, { content: 'shared then binned' });
    const share = await jsonRequest(app, 'POST', `/api/v1/memos/${doomed.uid}/shares`, {}, cookie);
    const { share: created } = (await share.json()) as { share: { token: string } };
    expect((await jsonRequest(app, 'GET', `/api/v1/shares/${created.token}`)).status).toBe(200);
    trash(db, doomed.uid);
    expect((await jsonRequest(app, 'GET', `/api/v1/shares/${created.token}`)).status).toBe(404);
  });

  it('drops out of the tag counts', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await createMemo(app, cookie, { content: 'keep #reef' });
    const doomed = await createMemo(app, cookie, { content: 'bin #binned' });
    trash(db, doomed.uid);
    const response = await jsonRequest(app, 'GET', '/api/v1/users/-/tags', undefined, cookie);
    const { tags } = (await response.json()) as { tags: Record<string, number> };
    expect(Object.keys(tags)).toEqual(['reef']);
  });

  it('drops out of the stats', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await createMemo(app, cookie, { content: 'keep' });
    const doomed = await createMemo(app, cookie, { content: 'bin' });
    trash(db, doomed.uid);
    const response = await jsonRequest(app, 'GET', '/api/v1/users/marlin/stats', undefined, cookie);
    expect(((await response.json()) as UserStatsDto).totalMemoCount).toBe(1);
  });

  it('cannot be found by search', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const doomed = await createMemo(app, cookie, { content: 'anemone by the drop-off' });
    expect(await list(app, `scope=home&filter=${encodeURIComponent('content.contains("anemone")')}`, cookie)).toHaveLength(1);
    trash(db, doomed.uid);
    expect(await list(app, `scope=home&filter=${encodeURIComponent('content.contains("anemone")')}`, cookie)).toHaveLength(0);
  });

  it('hides its comments', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const parent = await createMemo(app, cookie, { content: 'parent' });
    const comment = await jsonRequest(app, 'POST', `/api/v1/memos/${parent.uid}/comments`, { content: 'a reply' }, cookie);
    const { memo: created } = (await comment.json()) as { memo: MemoDto };
    trash(db, created.uid);
    const response = await jsonRequest(app, 'GET', `/api/v1/memos/${parent.uid}/comments`, undefined, cookie);
    expect(((await response.json()) as { memos: MemoDto[] }).memos).toHaveLength(0);
  });

  it('leaves no relation stub behind', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const target = await createMemo(app, cookie, { content: 'the target' });
    const source = await createMemo(app, cookie, { content: 'points at it', relatedMemoUids: [target.uid] });
    trash(db, target.uid);
    const response = await jsonRequest(app, 'GET', `/api/v1/memos/${source.uid}`, undefined, cookie);
    const { memo } = (await response.json()) as { memo: MemoDto };
    expect(memo.referencing).toHaveLength(0);
  });

  it('is never fished up by Go fish', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const keeper = await createMemo(app, cookie, { content: 'keeper' });
    const doomed = await createMemo(app, cookie, { content: 'binned' });
    trash(db, doomed.uid);
    for (let i = 0; i < 20; i += 1) {
      const response = await jsonRequest(app, 'GET', '/api/v1/memos/random', undefined, cookie);
      expect(((await response.json()) as { memo: MemoDto }).memo.uid).toBe(keeper.uid);
    }
  });

  it('never fires reminders, surfaces, or warns from the scheduler', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const reminder = await createMemo(app, cookie, { content: 'nudge me' });
    const bottle = await createMemo(app, cookie, { content: 'at sea', surfaceAt: now() + 3600 });
    const fading = await createMemo(app, cookie, { content: 'fading', dory: true, doryWindow: '1h' });
    db.$client.prepare('UPDATE memo SET remind_at = ? WHERE uid = ?').run(now() - 60, reminder.uid);
    db.$client.prepare('UPDATE memo SET surface_at = ? WHERE uid = ?').run(now() - 60, bottle.uid);
    for (const uid of [reminder.uid, bottle.uid, fading.uid]) trash(db, uid);

    const { runSchedulerTick } = await import('../services/scheduler.js');
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    expect(result).toMatchObject({ surfaced: 0, reminded: 0, warned: 0 });
  });
});

describe('trash — delete, restore, purge', () => {
  async function trashList(app: App, cookie: string): Promise<{ memos: MemoDto[]; retentionSeconds: number }> {
    const response = await jsonRequest(app, 'GET', '/api/v1/memos/trash', undefined, cookie);
    expect(response.status).toBe(200);
    return (await response.json()) as { memos: MemoDto[]; retentionSeconds: number };
  }

  it('moves a deleted memo to the trash instead of destroying it', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'second thoughts' });
    const response = await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, trashed: true });

    expect(await list(app, 'scope=home', cookie)).toHaveLength(0);
    const trashed = await trashList(app, cookie);
    expect(trashed.memos.map((m) => m.uid)).toEqual([memo.uid]);
    expect(trashed.memos[0]!.deletedAt).toBeGreaterThan(0);
    expect(trashed.retentionSeconds).toBe(7 * 86_400);
  });

  it('takes comments along, and lists only the parent in the trash', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const parent = await createMemo(app, cookie, { content: 'parent' });
    await jsonRequest(app, 'POST', `/api/v1/memos/${parent.uid}/comments`, { content: 'a reply' }, cookie);
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${parent.uid}`, undefined, cookie);
    expect((await trashList(app, cookie)).memos.map((m) => m.uid)).toEqual([parent.uid]);
  });

  it('restores a memo and its comments together', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const parent = await createMemo(app, cookie, { content: 'parent' });
    await jsonRequest(app, 'POST', `/api/v1/memos/${parent.uid}/comments`, { content: 'a reply' }, cookie);
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${parent.uid}`, undefined, cookie);

    const restore = await jsonRequest(app, 'POST', `/api/v1/memos/${parent.uid}/restore`, {}, cookie);
    expect(restore.status).toBe(200);
    expect(((await restore.json()) as { memo: MemoDto }).memo.deletedAt).toBeNull();

    expect((await list(app, 'scope=home', cookie)).map((m) => m.uid)).toEqual([parent.uid]);
    const comments = await jsonRequest(app, 'GET', `/api/v1/memos/${parent.uid}/comments`, undefined, cookie);
    expect(((await comments.json()) as { memos: MemoDto[] }).memos).toHaveLength(1);
    expect((await trashList(app, cookie)).memos).toHaveLength(0);
  });

  it('restores an archived memo back to the archive, not the feed', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'shelved' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { rowStatus: 'ARCHIVED' }, cookie);
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/restore`, {}, cookie);
    expect(await list(app, 'scope=home', cookie)).toHaveLength(0);
    expect((await list(app, 'state=ARCHIVED', cookie)).map((m) => m.uid)).toEqual([memo.uid]);
  });

  it('refuses to restore a memo that is not in the trash', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'right here' });
    const response = await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/restore`, {}, cookie);
    expect(response.status).toBe(400);
  });

  it('purges a trashed memo for good with ?permanent=1', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'really gone' });
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    const purge = await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}?permanent=1`, undefined, cookie);
    expect(await purge.json()).toMatchObject({ ok: true, trashed: false });
    expect((await trashList(app, cookie)).memos).toHaveLength(0);
    expect(db.$client.prepare('SELECT count(*) AS n FROM memo').get()).toMatchObject({ n: 0 });
  });

  it('purges a live memo outright with ?permanent=1 (no trash stop-over)', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'skip the bin' });
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}?permanent=1`, undefined, cookie);
    expect((await trashList(app, cookie)).memos).toHaveLength(0);
    expect((await jsonRequest(app, 'GET', `/api/v1/memos/${memo.uid}`, undefined, cookie)).status).toBe(404);
  });

  it('deleting twice does not extend the stay', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'once' });
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    const first = (await trashList(app, cookie)).memos[0]!.deletedAt;
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    const after = await trashList(app, cookie);
    expect(after.memos).toHaveLength(1);
    expect(after.memos[0]!.deletedAt).toBe(first);
  });

  it('empties the viewer\'s trash and nobody else\'s', async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    const dory = await signup(app, 'dory');
    for (const content of ['one', 'two']) {
      const memo = await createMemo(app, marlin, { content });
      await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, marlin);
    }
    const hers = await createMemo(app, dory, { content: 'dory\'s' });
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${hers.uid}`, undefined, dory);

    const emptied = await jsonRequest(app, 'POST', '/api/v1/memos/trash/empty', {}, marlin);
    expect(await emptied.json()).toMatchObject({ purged: 2 });
    expect((await trashList(app, marlin)).memos).toHaveLength(0);
    expect((await trashList(app, dory)).memos).toHaveLength(1);
  });

  it('keeps trash private and owner-only', async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    const dory = await signup(app, 'dory');
    const memo = await createMemo(app, marlin, { content: 'mine', visibility: 'PUBLIC' });
    expect((await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, dory)).status).toBe(403);
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, marlin);
    expect((await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/restore`, {}, dory)).status).toBe(403);
    expect((await jsonRequest(app, 'GET', '/api/v1/memos/trash')).status).toBe(401);
    expect((await trashList(app, dory)).memos).toHaveLength(0);
  });

  it("an admin's delete lands in the creator's trash", async () => {
    const { app } = makeTestApp();
    const admin = await signup(app, 'reefkeeper'); // first user is ADMIN
    const dory = await signup(app, 'dory');
    const hers = await createMemo(app, dory, { content: 'moderated', visibility: 'PUBLIC' });
    expect((await jsonRequest(app, 'DELETE', `/api/v1/memos/${hers.uid}`, undefined, admin)).status).toBe(200);
    expect((await trashList(app, admin)).memos).toHaveLength(0);
    expect((await trashList(app, dory)).memos.map((m) => m.uid)).toEqual([hers.uid]);
  });

  it('sweeps memos that have outstayed the retention window', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const old = await createMemo(app, cookie, { content: 'eight days ago' });
    const fresh = await createMemo(app, cookie, { content: 'an hour ago' });
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${old.uid}`, undefined, cookie);
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${fresh.uid}`, undefined, cookie);
    trash(db, old.uid, now() - 8 * 86_400);

    const { sweepTrash } = await import('../services/trash-sweeper.js');
    expect(sweepTrash(db, config.uploadsDir)).toBe(1);
    expect((await trashList(app, cookie)).memos.map((m) => m.uid)).toEqual([fresh.uid]);
  });

  it('runs the sweep inside the one scheduler tick', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'long forgotten' });
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    trash(db, memo.uid, now() - 8 * 86_400);

    const { runSchedulerTick } = await import('../services/scheduler.js');
    expect(runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null })).toMatchObject({ purged: 1 });
    expect(db.$client.prepare('SELECT count(*) AS n FROM memo').get()).toMatchObject({ n: 0 });
  });

  it('keeps a trashed memo out of the Dory forgotten count', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'trashed then expired', dory: true, doryWindow: '1h' });
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    db.$client.prepare('UPDATE memo SET forget_at = ? WHERE uid = ?').run(now() - 60, memo.uid);

    const { runSchedulerTick } = await import('../services/scheduler.js');
    expect(runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null })).toMatchObject({ forgotten: 0 });
    const user = db.$client.prepare('SELECT dory_forgotten_count AS n FROM user WHERE username = ?').get('marlin');
    expect(user).toMatchObject({ n: 0 });
    // Still in the trash, waiting for its week to run out.
    expect((await trashList(app, cookie)).memos.map((m) => m.uid)).toEqual([memo.uid]);
  });
});
