import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { memos } from '../db/schema.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

describe('editing is creator-only (admins keep moderation)', () => {
  it('blocks an admin from editing someone else’s content', async () => {
    const { app } = makeTestApp();
    const admin = await signup(app, 'reefkeeper'); // first user = ADMIN
    const author = await signup(app, 'coral');
    const memo = await createMemo(app, author, { content: 'mine', visibility: 'PUBLIC' });

    for (const body of [{ content: 'overwritten' }, { visibility: 'PRIVATE' }, { pinned: true }, { dory: true }]) {
      const response = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, body, admin);
      expect(response.status, JSON.stringify(body)).toBe(403);
    }
  });

  it('still lets an admin archive and delete for moderation', async () => {
    const { app } = makeTestApp();
    const admin = await signup(app, 'reefkeeper');
    const author = await signup(app, 'coral');
    const memo = await createMemo(app, author, { content: 'mine', visibility: 'PUBLIC' });

    const archive = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { rowStatus: 'ARCHIVED' }, admin);
    expect(archive.status).toBe(200);
    const del = await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, admin);
    expect(del.status).toBe(200);
  });

  it('lets the creator edit their own memo', async () => {
    const { app } = makeTestApp();
    await signup(app, 'reefkeeper');
    const author = await signup(app, 'coral');
    const memo = await createMemo(app, author, { content: 'mine' });
    const response = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'mine, edited' }, author);
    expect(response.status).toBe(200);
  });
});

describe('updatedTs marks content edits only', () => {
  it('does not bump updatedTs for pin/visibility changes, only for content', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'coral');
    const memo = await createMemo(app, cookie, { content: 'original', visibility: 'PUBLIC' });

    // Backdate the row so a bump is unmistakable regardless of clock granularity.
    const past = 1_000_000_000;
    db.update(memos).set({ createdTs: past, updatedTs: past }).where(eq(memos.uid, memo.uid)).run();

    const pin = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { pinned: true }, cookie);
    expect(pin.status).toBe(200);
    const afterPin = (await pin.json()) as { memo: { updatedTs: number } };
    expect(afterPin.memo.updatedTs).toBe(past);

    const vis = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { visibility: 'PROTECTED' }, cookie);
    const afterVis = (await vis.json()) as { memo: { updatedTs: number } };
    expect(afterVis.memo.updatedTs).toBe(past);

    const edit = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'rewritten' }, cookie);
    const afterEdit = (await edit.json()) as { memo: { updatedTs: number; createdTs: number } };
    expect(afterEdit.memo.updatedTs).toBeGreaterThan(past);
  });
});

describe('inbox read state', () => {
  async function makeNotification(app: ReturnType<typeof makeTestApp>['app']) {
    const owner = await signup(app, 'anemone');
    const commenter = await signup(app, 'bubbles');
    const memo = await createMemo(app, owner, { content: 'hello', visibility: 'PUBLIC' });
    const comment = await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/comments`, { content: 'hi!' }, commenter);
    expect(comment.status).toBe(201);
    return owner;
  }

  it('supports marking a notification READ and listing by READ', async () => {
    const { app } = makeTestApp();
    const owner = await makeNotification(app);

    const unread = (await (await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, owner)).json()) as {
      items: { id: number }[];
    };
    expect(unread.items).toHaveLength(1);
    const id = unread.items[0]!.id;

    const mark = await jsonRequest(app, 'PATCH', `/api/v1/inbox/${id}`, { status: 'READ' }, owner);
    expect(mark.status).toBe(200);

    const readList = (await (await jsonRequest(app, 'GET', '/api/v1/inbox?status=READ', undefined, owner)).json()) as {
      items: { id: number }[];
      unreadCount: number;
    };
    expect(readList.items.map((i) => i.id)).toEqual([id]);
    expect(readList.unreadCount).toBe(0);

    const unreadAfter = (await (await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, owner)).json()) as {
      items: unknown[];
    };
    expect(unreadAfter.items).toHaveLength(0);
  });

  it('read-all moves UNREAD to READ, not ARCHIVED', async () => {
    const { app } = makeTestApp();
    const owner = await makeNotification(app);

    const readAll = await jsonRequest(app, 'POST', '/api/v1/inbox/read-all', undefined, owner);
    expect(readAll.status).toBe(200);

    const archived = (await (await jsonRequest(app, 'GET', '/api/v1/inbox?status=ARCHIVED', undefined, owner)).json()) as { items: unknown[] };
    expect(archived.items).toHaveLength(0);
    const read = (await (await jsonRequest(app, 'GET', '/api/v1/inbox?status=READ', undefined, owner)).json()) as { items: unknown[] };
    expect(read.items).toHaveLength(1);
  });

  it('deletes a notification permanently', async () => {
    const { app } = makeTestApp();
    const owner = await makeNotification(app);
    const unread = (await (await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, owner)).json()) as {
      items: { id: number }[];
    };
    const id = unread.items[0]!.id;
    const del = await jsonRequest(app, 'DELETE', `/api/v1/inbox/${id}`, undefined, owner);
    expect(del.status).toBe(200);
    for (const status of ['UNREAD', 'READ', 'ARCHIVED']) {
      const list = (await (await jsonRequest(app, 'GET', `/api/v1/inbox?status=${status}`, undefined, owner)).json()) as { items: unknown[] };
      expect(list.items, status).toHaveLength(0);
    }
  });
});
