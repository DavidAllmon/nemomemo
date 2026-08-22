import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { InboxDto, MemoDto } from '@nemomemo/shared';
import { memos } from '../db/schema.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

describe('relation-stub access control', () => {
  it('refuses to link a memo the actor cannot read, and hides stubs the viewer cannot read', async () => {
    const { app } = makeTestApp();
    const alice = await signup(app, 'alice');
    const bob = await signup(app, 'bob');

    const secret = await createMemo(app, alice, { content: 'the secret spot', visibility: 'PRIVATE' });
    const mine = await createMemo(app, bob, { content: 'my note', visibility: 'PROTECTED' });

    // Bob tries to reference Alice's private memo — the link is silently dropped.
    const patched = await jsonRequest(
      app,
      'PATCH',
      `/api/v1/memos/${mine.uid}`,
      { relatedMemoUids: [secret.uid] },
      bob,
    );
    expect(((await patched.json()) as { memo: MemoDto }).memo.referencing).toEqual([]);

    // Even a legitimately-created reference stops leaking once the target goes private.
    const shared = await createMemo(app, alice, { content: 'was protected', visibility: 'PROTECTED' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${mine.uid}`, { relatedMemoUids: [shared.uid] }, bob);
    const before = await jsonRequest(app, 'GET', `/api/v1/memos/${mine.uid}`, undefined, bob);
    expect(((await before.json()) as { memo: MemoDto }).memo.referencing).toHaveLength(1);

    await jsonRequest(app, 'PATCH', `/api/v1/memos/${shared.uid}`, { visibility: 'PRIVATE' }, alice);
    const after = await jsonRequest(app, 'GET', `/api/v1/memos/${mine.uid}`, undefined, bob);
    expect(((await after.json()) as { memo: MemoDto }).memo.referencing).toEqual([]);
    // Alice herself still sees the back-reference.
    const aliceView = await jsonRequest(app, 'GET', `/api/v1/memos/${shared.uid}`, undefined, alice);
    expect(((await aliceView.json()) as { memo: MemoDto }).memo.referencedBy).toHaveLength(1);
  });
});

describe('mention notification privacy', () => {
  it('never notifies mentions in PRIVATE memos', async () => {
    const { app } = makeTestApp();
    const alice = await signup(app, 'alice');
    const bob = await signup(app, 'bob');
    await createMemo(app, alice, { content: 'note to self about @bob', visibility: 'PRIVATE' });
    const inbox = await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, bob);
    expect(((await inbox.json()) as { items: InboxDto[] }).items).toHaveLength(0);
  });

  it('hides the snippet when a memo goes private after the mention', async () => {
    const { app } = makeTestApp();
    const alice = await signup(app, 'alice');
    const bob = await signup(app, 'bob');
    const memo = await createMemo(app, alice, { content: 'hey @bob look', visibility: 'PROTECTED' });

    const visible = await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, bob);
    expect(((await visible.json()) as { items: InboxDto[] }).items[0]!.memoSnippet).toContain('look');

    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { visibility: 'PRIVATE' }, alice);
    const hidden = await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, bob);
    const item = ((await hidden.json()) as { items: InboxDto[] }).items[0]!;
    expect(item.memoSnippet).toBeNull();
    expect(item.memoUid).toBeNull();
  });
});

describe('dory expiry closes every read path', () => {
  it('comments cannot be dory memos', async () => {
    const { app } = makeTestApp();
    const alice = await signup(app, 'alice');
    const memo = await createMemo(app, alice, { content: 'parent' });
    const comment = await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/comments`, { content: 'hi' }, alice);
    const commentUid = ((await comment.json()) as { memo: MemoDto }).memo.uid;
    const doryIt = await jsonRequest(app, 'PATCH', `/api/v1/memos/${commentUid}`, { dory: true }, alice);
    expect(doryIt.status).toBe(400);
  });

  it('expired-but-unswept comments vanish from the comment list and direct reads', async () => {
    const { app, db } = makeTestApp();
    const alice = await signup(app, 'alice');
    const memo = await createMemo(app, alice, { content: 'parent', visibility: 'PUBLIC' });
    const created = await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/comments`, { content: 'temp' }, alice);
    const commentUid = ((await created.json()) as { memo: MemoDto }).memo.uid;

    db.update(memos)
      .set({ forgetAt: Math.floor(Date.now() / 1000) - 5 })
      .where(eq(memos.uid, commentUid))
      .run();

    const list = await jsonRequest(app, 'GET', `/api/v1/memos/${memo.uid}/comments`, undefined, alice);
    expect(((await list.json()) as { memos: MemoDto[] }).memos).toHaveLength(0);
    const direct = await jsonRequest(app, 'GET', `/api/v1/memos/${commentUid}`, undefined, alice);
    expect(direct.status).toBe(404);
  });

  it('a comment dies the moment its parent expires, before the sweeper runs', async () => {
    const { app, db } = makeTestApp();
    const alice = await signup(app, 'alice');
    const bob = await signup(app, 'bob');
    const parent = await createMemo(app, alice, { content: 'ephemeral parent', visibility: 'PUBLIC', dory: true });
    const created = await jsonRequest(app, 'POST', `/api/v1/memos/${parent.uid}/comments`, { content: 'me too' }, bob);
    const commentUid = ((await created.json()) as { memo: MemoDto }).memo.uid;

    db.update(memos)
      .set({ forgetAt: Math.floor(Date.now() / 1000) - 5 })
      .where(eq(memos.uid, parent.uid))
      .run();

    const direct = await jsonRequest(app, 'GET', `/api/v1/memos/${commentUid}`, undefined, bob);
    expect(direct.status).toBe(404);
  });
});

describe('unknown API paths', () => {
  it('return JSON 404, never the SPA page', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'GET', '/api/v1/definitely-not-a-thing');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
