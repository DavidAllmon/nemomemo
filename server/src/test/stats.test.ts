import { describe, expect, it } from 'vitest';
import type { UserStatsDto } from '@nemomemo/shared';
import { eq } from 'drizzle-orm';
import { memos } from '../db/schema.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

async function getTags(
  app: Parameters<typeof jsonRequest>[0],
  cookie: string,
): Promise<Record<string, number>> {
  const response = await jsonRequest(app, 'GET', '/api/v1/users/-/tags', undefined, cookie);
  expect(response.status).toBe(200);
  return ((await response.json()) as { tags: Record<string, number> }).tags;
}

async function getStats(
  app: Parameters<typeof jsonRequest>[0],
  username: string,
  cookie?: string,
): Promise<UserStatsDto> {
  const response = await jsonRequest(app, 'GET', `/api/v1/users/${username}/stats`, undefined, cookie);
  expect(response.status).toBe(200);
  return (await response.json()) as UserStatsDto;
}

describe('tag + stats aggregation', () => {
  it('counts tags including implied ancestors across own memos', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await createMemo(app, cookie, { content: 'dive at #reef/coral' });
    await createMemo(app, cookie, { content: 'notes on #reef' });
    expect(await getTags(app, cookie)).toEqual({ reef: 2, 'reef/coral': 1 });
  });

  it('aggregates every stats field including open task totals', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const pinnedMemo = await createMemo(app, cookie, { content: '- [ ] a\n- [ ] b' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${pinnedMemo.uid}`, { pinned: true }, cookie);
    await createMemo(app, cookie, { content: '- [ ] c\n- [x] d' });
    await createMemo(app, cookie, { content: 'see https://reef.dev and `code`' });

    const stats = await getStats(app, 'nemo', cookie);
    expect(stats.totalMemoCount).toBe(3);
    expect(stats.memoCreatedTimestamps).toHaveLength(3);
    expect(stats.linkCount).toBe(1);
    expect(stats.codeCount).toBe(1);
    expect(stats.taskCount).toBe(2);
    expect(stats.incompleteTaskCount).toBe(2);
    expect(stats.openTaskCount).toBe(3);
    expect(stats.pinnedCount).toBe(1);
  });

  it('expired dory memos, pending bottles, and comments never count', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const doomed = await createMemo(app, cookie, { content: '#secret gone', dory: true });
    await createMemo(app, cookie, {
      content: '#atsea waiting',
      surfaceAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const parent = await createMemo(app, cookie, { content: '#kept parent' });
    const comment = await jsonRequest(
      app,
      'POST',
      `/api/v1/memos/${parent.uid}/comments`,
      { content: '#commenttag hi' },
      cookie,
    );
    expect(comment.status).toBe(201);
    db.update(memos)
      .set({ forgetAt: Math.floor(Date.now() / 1000) - 10 })
      .where(eq(memos.uid, doomed.uid))
      .run();

    expect(await getTags(app, cookie)).toEqual({ kept: 1 });
    const stats = await getStats(app, 'nemo', cookie);
    expect(stats.totalMemoCount).toBe(1);
    expect(stats.tagCounts).toEqual({ kept: 1 });
  });

  it('another viewer only sees public/protected counts', async () => {
    const { app } = makeTestApp();
    const owner = await signup(app, 'nemo');
    const friend = await signup(app, 'marlin');
    await createMemo(app, owner, { content: '#open swim', visibility: 'PUBLIC' });
    await createMemo(app, owner, { content: '#hidden secret', visibility: 'PRIVATE' });

    const mine = await getStats(app, 'nemo', owner);
    expect(mine.totalMemoCount).toBe(2);
    const theirs = await getStats(app, 'nemo', friend);
    expect(theirs.totalMemoCount).toBe(1);
    expect(theirs.tagCounts).toEqual({ open: 1 });
  });
});
