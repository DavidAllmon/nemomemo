import { describe, expect, it } from 'vitest';
import type { MemoDto } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

const future = (secs: number) => Math.floor(Date.now() / 1000) + secs;

describe('message in a bottle', () => {
  it('a pending bottle is hidden from the owner feed and explore', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'sender');
    await createMemo(app, cookie, {
      content: 'dear future me',
      visibility: 'PUBLIC',
      surfaceAt: future(3600),
    });
    const home = (await (
      await jsonRequest(app, 'GET', '/api/v1/memos?scope=home', undefined, cookie)
    ).json()) as { memos: MemoDto[] };
    expect(home.memos).toHaveLength(0);
    const explore = (await (
      await jsonRequest(app, 'GET', '/api/v1/memos?scope=explore', undefined, cookie)
    ).json()) as { memos: MemoDto[] };
    expect(explore.memos).toHaveLength(0);
  });

  it('rejects pinning a bottle, and a bottle that would be forgotten before it surfaces', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'sender');
    const bottle = await createMemo(app, cookie, { content: 'at sea', surfaceAt: future(3600) });
    expect(
      (await jsonRequest(app, 'PATCH', `/api/v1/memos/${bottle.uid}`, { pinned: true }, cookie)).status,
    ).toBe(400);
    // dory (24h default) + surface in 3d ⇒ forget_at < surface_at ⇒ rejected
    const response = await jsonRequest(
      app,
      'POST',
      '/api/v1/memos',
      { content: 'x', dory: true, surfaceAt: future(3 * 24 * 3600) },
      cookie,
    );
    expect(response.status).toBe(400);
  });

  it('rejects a bottle dated in the past, and bottles on comments', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'sender');
    const past = await jsonRequest(app, 'POST', '/api/v1/memos', { content: 'x', surfaceAt: 1000 }, cookie);
    expect(past.status).toBe(400);
    const parent = await createMemo(app, cookie, { content: 'parent' });
    const comment = (await (
      await jsonRequest(app, 'POST', `/api/v1/memos/${parent.uid}/comments`, { content: 'a comment' }, cookie)
    ).json()) as { memo: MemoDto };
    const bottled = await jsonRequest(
      app,
      'PATCH',
      `/api/v1/memos/${comment.memo.uid}`,
      { surfaceAt: future(3600) },
      cookie,
    );
    expect(bottled.status).toBe(400);
  });

  it('a pending bottle is readable by its creator, invisible to everyone else — even via share token', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'sender');
    const other = await signup(app, 'other');
    const bottle = await createMemo(app, cookie, {
      content: 'secret till Tuesday',
      visibility: 'PUBLIC',
      surfaceAt: future(3600),
    });
    expect((await jsonRequest(app, 'GET', `/api/v1/memos/${bottle.uid}`, undefined, cookie)).status).toBe(200);
    expect((await jsonRequest(app, 'GET', `/api/v1/memos/${bottle.uid}`, undefined, other)).status).toBe(404);
    const share = (await (
      await jsonRequest(app, 'POST', `/api/v1/memos/${bottle.uid}/shares`, { expiresIn: 'never' }, cookie)
    ).json()) as { share: { token: string } };
    expect((await jsonRequest(app, 'GET', `/api/v1/shares/${share.share.token}`)).status).toBe(404);
  });

  it('clearing surfaceAt returns the memo to the feed', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'sender');
    const bottle = await createMemo(app, cookie, { content: 'changed my mind', surfaceAt: future(3600) });
    const cleared = await jsonRequest(
      app,
      'PATCH',
      `/api/v1/memos/${bottle.uid}`,
      { surfaceAt: null },
      cookie,
    );
    expect(((await cleared.json()) as { memo: MemoDto }).memo.surfaceAt).toBeNull();
    const home = (await (
      await jsonRequest(app, 'GET', '/api/v1/memos?scope=home', undefined, cookie)
    ).json()) as { memos: MemoDto[] };
    expect(home.memos).toHaveLength(1);
  });
});
