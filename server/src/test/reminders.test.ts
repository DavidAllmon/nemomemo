import { describe, expect, it } from 'vitest';
import type { MemoDto } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

const future = (secs: number) => Math.floor(Date.now() / 1000) + secs;

describe('reminders', () => {
  it('sets, repeats, and clears a reminder', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'water the plants' });
    const on = await jsonRequest(
      app,
      'PATCH',
      `/api/v1/memos/${memo.uid}`,
      { remindAt: future(3600), remindEvery: 'WEEKLY' },
      cookie,
    );
    const dto = ((await on.json()) as { memo: MemoDto }).memo;
    expect(dto.remindAt).not.toBeNull();
    expect(dto.remindEvery).toBe('WEEKLY');
    const off = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindAt: null }, cookie);
    const offDto = ((await off.json()) as { memo: MemoDto }).memo;
    expect(offDto.remindAt).toBeNull();
    expect(offDto.remindEvery).toBeNull();
  });

  it('rejects a reminder in the past and repeats without a reminder', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'x' });
    expect((await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindAt: 1000 }, cookie)).status).toBe(400);
    expect(
      (await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindEvery: 'DAILY' }, cookie)).status,
    ).toBe(400);
  });

  it('only the creator can set a reminder', async () => {
    const { app } = makeTestApp();
    const admin = await signup(app, 'admin'); // first signup = ADMIN
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'mine', visibility: 'PUBLIC' });
    expect(
      (await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindAt: future(3600) }, admin)).status,
    ).toBe(403);
  });
});
