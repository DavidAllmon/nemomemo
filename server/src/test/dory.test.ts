import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { MemoDto } from '@nemomemo/shared';
import { memos } from '../db/schema.js';
import { sweepDoryMemos } from '../services/dory-sweeper.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

describe('dory memos', () => {
  it('creates a memo with a forgetAt 24h out', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const memo = (await createMemo(app, cookie, { content: 'P. Sherman 42 Wallaby Way', dory: true })) as unknown as MemoDto;
    expect(memo.forgetAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 23 * 3600);
  });

  it('toggling dory on later starts a fresh 24h; off clears it', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const memo = await createMemo(app, cookie, { content: 'hello' });
    const on = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { dory: true }, cookie);
    expect(((await on.json()) as { memo: MemoDto }).memo.forgetAt).not.toBeNull();
    const off = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { dory: false }, cookie);
    expect(((await off.json()) as { memo: MemoDto }).memo.forgetAt).toBeNull();
  });

  it('rejects pinning a dory memo (and vice versa)', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const dory = await createMemo(app, cookie, { content: 'fading', dory: true });
    const pinIt = await jsonRequest(app, 'PATCH', `/api/v1/memos/${dory.uid}`, { pinned: true }, cookie);
    expect(pinIt.status).toBe(400);

    const pinned = await createMemo(app, cookie, { content: 'important' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${pinned.uid}`, { pinned: true }, cookie);
    const doryIt = await jsonRequest(app, 'PATCH', `/api/v1/memos/${pinned.uid}`, { dory: true }, cookie);
    expect(doryIt.status).toBe(400);
  });

  it('archiving rescues a memo from Dory', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const memo = await createMemo(app, cookie, { content: 'save me', dory: true });
    const archived = await jsonRequest(
      app,
      'PATCH',
      `/api/v1/memos/${memo.uid}`,
      { rowStatus: 'ARCHIVED' },
      cookie,
    );
    expect(((await archived.json()) as { memo: MemoDto }).memo.forgetAt).toBeNull();
  });

  it('expired memos never leak from lists or reads, and the sweeper deletes them with their comments', async () => {
    const { app, db, config } = makeTestApp();
    const owner = await signup(app, 'dory');
    const friend = await signup(app, 'marlin');
    const memo = await createMemo(app, owner, { content: 'ephemeral', visibility: 'PUBLIC', dory: true });
    await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/comments`, { content: 'nice!' }, friend);

    // Force expiry by rewinding forget_at.
    const past = Math.floor(Date.now() / 1000) - 10;
    db.update(memos).set({ forgetAt: past }).where(eq(memos.uid, memo.uid)).run();

    const read = await jsonRequest(app, 'GET', `/api/v1/memos/${memo.uid}`, undefined, owner);
    expect(read.status).toBe(404);
    const list = await jsonRequest(app, 'GET', '/api/v1/memos?scope=home', undefined, owner);
    expect(((await list.json()) as { memos: MemoDto[] }).memos).toHaveLength(0);

    const swept = sweepDoryMemos(db, config.uploadsDir);
    expect(swept).toBe(1);
    // The comment memo went with the parent.
    expect(db.select().from(memos).all()).toHaveLength(0);
  });
});
