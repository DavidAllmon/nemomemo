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
