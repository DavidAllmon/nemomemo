import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { MemoDto, ShareDto } from '@nemomemo/shared';
import { memoShares } from '../db/schema.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

describe('share links', () => {
  it('grants anonymous access to a private memo via token', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'secret reef spot', visibility: 'PRIVATE' });

    const created = await jsonRequest(
      app,
      'POST',
      `/api/v1/memos/${memo.uid}/shares`,
      { expiresIn: '7d' },
      cookie,
    );
    expect(created.status).toBe(201);
    const { share } = (await created.json()) as { share: ShareDto };
    expect(share.expiresTs).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const anon = await jsonRequest(app, 'GET', `/api/v1/shares/${share.token}`);
    expect(anon.status).toBe(200);
    const shared = ((await anon.json()) as { memo: MemoDto }).memo;
    expect(shared.content).toBe('secret reef spot');
    // Share scope excludes the relation graph and comments.
    expect(shared.referencing).toEqual([]);
    expect(shared.commentCount).toBe(0);
  });

  it('expired tokens 404', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'gone soon' });
    const created = await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/shares`, { expiresIn: '1d' }, cookie);
    const { share } = (await created.json()) as { share: ShareDto };
    db.update(memoShares)
      .set({ expiresTs: Math.floor(Date.now() / 1000) - 5 })
      .where(eq(memoShares.uid, share.token))
      .run();
    const anon = await jsonRequest(app, 'GET', `/api/v1/shares/${share.token}`);
    expect(anon.status).toBe(404);
  });

  it('revoking removes access; only the author can revoke', async () => {
    const { app } = makeTestApp();
    const owner = await signup(app, 'marlin');
    const other = await signup(app, 'dory');
    const memo = await createMemo(app, owner, { content: 'shared' });
    const created = await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/shares`, { expiresIn: 'never' }, owner);
    const { share } = (await created.json()) as { share: ShareDto };

    const denied = await jsonRequest(app, 'DELETE', `/api/v1/shares/${share.token}`, undefined, other);
    expect(denied.status).toBe(403);
    const revoked = await jsonRequest(app, 'DELETE', `/api/v1/shares/${share.token}`, undefined, owner);
    expect(revoked.status).toBe(200);
    const anon = await jsonRequest(app, 'GET', `/api/v1/shares/${share.token}`);
    expect(anon.status).toBe(404);
  });
});
