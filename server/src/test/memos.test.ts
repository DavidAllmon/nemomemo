import { describe, expect, it } from 'vitest';
import type { MemoDto, MemoListResponse } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

async function listMemos(
  app: Parameters<typeof jsonRequest>[0],
  query: string,
  cookie?: string,
): Promise<MemoListResponse> {
  const response = await jsonRequest(app, 'GET', `/api/v1/memos?${query}`, undefined, cookie);
  if (response.status !== 200) {
    throw new Error(`list failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as MemoListResponse;
}

describe('memo CRUD + payload extraction', () => {
  it('creates a memo and extracts tags/properties', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = (await createMemo(app, cookie, {
      content: 'Check #reef/coral and [docs](https://x.dev)\n\n- [ ] feed fish',
      visibility: 'PUBLIC',
    })) as unknown as MemoDto;
    expect(memo.tags).toEqual(['reef', 'reef/coral']);
    expect(memo.property).toMatchObject({
      hasLink: true,
      hasTaskList: true,
      hasIncompleteTasks: true,
      hasCode: false,
    });
  });

  it('updates content and re-extracts payload', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: '#old' });
    const response = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: '#new `code`' }, cookie);
    const updated = ((await response.json()) as { memo: MemoDto }).memo;
    expect(updated.tags).toEqual(['new']);
    expect(updated.property.hasCode).toBe(true);
  });

  it('pins, archives, restores, deletes', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'hello' });

    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { pinned: true }, cookie);
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { rowStatus: 'ARCHIVED' }, cookie);
    const archived = await listMemos(app, 'state=ARCHIVED', cookie);
    expect(archived.memos).toHaveLength(1);
    const home = await listMemos(app, 'scope=home', cookie);
    expect(home.memos).toHaveLength(0);

    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { rowStatus: 'NORMAL' }, cookie);
    const del = await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    expect(del.status).toBe(200);
    const gone = await jsonRequest(app, 'GET', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    expect(gone.status).toBe(404);
  });
});

describe('ACL matrix', () => {
  it('enforces visibility for owner, other user, and anonymous', async () => {
    const { app } = makeTestApp();
    const owner = await signup(app, 'marlin');
    const other = await signup(app, 'dory');

    const priv = await createMemo(app, owner, { content: 'private', visibility: 'PRIVATE' });
    const prot = await createMemo(app, owner, { content: 'protected', visibility: 'PROTECTED' });
    const pub = await createMemo(app, owner, { content: 'public', visibility: 'PUBLIC' });

    const check = async (uid: string, cookie: string | undefined, expected: number) => {
      const response = await jsonRequest(app, 'GET', `/api/v1/memos/${uid}`, undefined, cookie);
      expect(response.status).toBe(expected);
    };

    await check(priv.uid, owner, 200);
    await check(priv.uid, other, 404);
    await check(priv.uid, undefined, 404);
    await check(prot.uid, owner, 200);
    await check(prot.uid, other, 200);
    await check(prot.uid, undefined, 401);
    await check(pub.uid, owner, 200);
    await check(pub.uid, other, 200);
    await check(pub.uid, undefined, 200);
  });

  it('hides PUBLIC memos from anonymous when instance is private', async () => {
    const { app } = makeTestApp();
    const owner = await signup(app, 'marlin');
    await jsonRequest(app, 'PATCH', '/api/v1/instance/settings', { general: { publicMode: false } }, owner);
    const pub = await createMemo(app, owner, { content: 'public', visibility: 'PUBLIC' });
    const anon = await jsonRequest(app, 'GET', `/api/v1/memos/${pub.uid}`);
    expect(anon.status).toBe(401);
    const explore = await listMemos(app, 'scope=explore');
    expect(explore.memos).toHaveLength(0);
  });

  it('explore shows PUBLIC+PROTECTED to signed-in, PUBLIC only to anonymous', async () => {
    const { app } = makeTestApp();
    const owner = await signup(app, 'marlin');
    const other = await signup(app, 'dory');
    await createMemo(app, owner, { content: 'private', visibility: 'PRIVATE' });
    await createMemo(app, owner, { content: 'protected', visibility: 'PROTECTED' });
    await createMemo(app, owner, { content: 'public', visibility: 'PUBLIC' });

    expect((await listMemos(app, 'scope=explore', other)).memos).toHaveLength(2);
    expect((await listMemos(app, 'scope=explore')).memos).toHaveLength(1);
  });
});

describe('filters', () => {
  it('filters by tag, content, property, and combinations', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await createMemo(app, cookie, { content: '#work meeting notes' });
    await createMemo(app, cookie, { content: '#play at the reef with `code`' });
    await createMemo(app, cookie, { content: '- [ ] #work task' });

    const byTag = await listMemos(app, `filter=${encodeURIComponent('"work" in tags')}`, cookie);
    expect(byTag.memos).toHaveLength(2);

    const byContent = await listMemos(app, `filter=${encodeURIComponent('content.contains("reef")')}`, cookie);
    expect(byContent.memos).toHaveLength(1);

    const tasks = await listMemos(
      app,
      `filter=${encodeURIComponent('has_task_list && has_incomplete_tasks')}`,
      cookie,
    );
    expect(tasks.memos).toHaveLength(1);

    const combo = await listMemos(
      app,
      `filter=${encodeURIComponent('"work" in tags && !has_task_list')}`,
      cookie,
    );
    expect(combo.memos).toHaveLength(1);

    const bad = await jsonRequest(app, 'GET', '/api/v1/memos?filter=bogus', undefined, cookie);
    expect(bad.status).toBe(400);
  });

  it('nested tag search matches ancestors', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await createMemo(app, cookie, { content: 'note #dev/git' });
    const parent = await listMemos(app, `filter=${encodeURIComponent('"dev" in tags')}`, cookie);
    expect(parent.memos).toHaveLength(1);
  });
});

describe('pagination', () => {
  it('pages with tokens and pins first', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    for (let i = 0; i < 5; i++) {
      await createMemo(app, cookie, { content: `memo ${i}` });
    }
    const pinned = await createMemo(app, cookie, { content: 'pinned memo' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${pinned.uid}`, { pinned: true }, cookie);

    const page1 = await listMemos(app, 'pageSize=4', cookie);
    expect(page1.memos).toHaveLength(4);
    expect(page1.memos[0]!.uid).toBe(pinned.uid);
    expect(page1.nextPageToken).toBeTruthy();

    const page2 = await listMemos(app, `pageSize=4&pageToken=${page1.nextPageToken}`, cookie);
    expect(page2.memos).toHaveLength(2);
    expect(page2.nextPageToken).toBeNull();
  });
});

describe('comments, reactions, inbox', () => {
  it('comments inherit parent visibility and notify the owner', async () => {
    const { app } = makeTestApp();
    const owner = await signup(app, 'marlin');
    const other = await signup(app, 'dory');
    const memo = await createMemo(app, owner, { content: 'parent', visibility: 'PROTECTED' });

    const comment = await jsonRequest(
      app,
      'POST',
      `/api/v1/memos/${memo.uid}/comments`,
      { content: 'hi @marlin!' },
      other,
    );
    expect(comment.status).toBe(201);

    const comments = await jsonRequest(app, 'GET', `/api/v1/memos/${memo.uid}/comments`, undefined, owner);
    const list = (await comments.json()) as { memos: MemoDto[] };
    expect(list.memos).toHaveLength(1);
    expect(list.memos[0]!.parentUid).toBe(memo.uid);

    // Comment memos never appear in the home feed.
    const otherHome = await listMemos(app, 'scope=home', other);
    expect(otherHome.memos).toHaveLength(0);

    // Owner got a comment notification (self-mention in the comment doesn't double up).
    const inbox = await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, owner);
    const items = (await inbox.json()) as { items: { type: string }[]; unreadCount: number };
    expect(items.unreadCount).toBeGreaterThanOrEqual(1);
    expect(items.items.some((item) => item.type === 'MEMO_COMMENT')).toBe(true);
  });

  it('reactions toggle and respect the allowed set', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'react to me', visibility: 'PUBLIC' });

    const ok = await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/reactions`, { emoji: '🐠' }, cookie);
    expect(ok.status).toBe(200);
    const withReaction = ((await ok.json()) as { memo: MemoDto }).memo;
    expect(withReaction.reactions).toEqual([{ emoji: '🐠', count: 1, reactedByViewer: true }]);

    const bad = await jsonRequest(app, 'POST', `/api/v1/memos/${memo.uid}/reactions`, { emoji: '🦖' }, cookie);
    expect(bad.status).toBe(400);

    const removed = await jsonRequest(
      app,
      'DELETE',
      `/api/v1/memos/${memo.uid}/reactions/${encodeURIComponent('🐠')}`,
      undefined,
      cookie,
    );
    const after = ((await removed.json()) as { memo: MemoDto }).memo;
    expect(after.reactions).toHaveLength(0);
  });

  it('mentions in a memo create inbox notifications', async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    await signup(app, 'dory');
    await createMemo(app, marlin, { content: 'hey @dory look at this', visibility: 'PROTECTED' });
    const doryCookie = (await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
      username: 'dory',
      password: 'password123',
    }).then((r) => r.headers.get('set-cookie')))!.split(';')[0]!;
    const inbox = await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, doryCookie);
    const items = (await inbox.json()) as { items: { type: string }[] };
    expect(items.items.some((item) => item.type === 'MEMO_MENTION')).toBe(true);
  });
});

describe('GET /api/v1/memos/random — Go fish', () => {
  /** Draw many times so a leak can't hide behind luck. */
  async function draw(
    app: Parameters<typeof jsonRequest>[0],
    cookie: string,
    times = 20,
  ): Promise<string[]> {
    const uids: string[] = [];
    for (let i = 0; i < times; i += 1) {
      const response = await jsonRequest(app, 'GET', '/api/v1/memos/random', undefined, cookie);
      if (response.status !== 200) throw new Error(`random failed: ${response.status}`);
      uids.push(((await response.json()) as { memo: MemoDto }).memo.uid);
    }
    return uids;
  }

  it("returns one of the viewer's own memos", async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const mine = new Set<string>();
    for (const content of ['one fish', 'two fish', 'red fish']) {
      mine.add((await createMemo(app, cookie, { content })).uid);
    }
    const drawn = await draw(app, cookie);
    expect(drawn.every((uid) => mine.has(uid))).toBe(true);
    // 20 draws from 3 memos: seeing only one would be a 1-in-2-billion fluke.
    expect(new Set(drawn).size).toBeGreaterThan(1);
  });

  it('404s for an empty reef', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const response = await jsonRequest(app, 'GET', '/api/v1/memos/random', undefined, cookie);
    expect(response.status).toBe(404);
  });

  it('never fishes up an expired Dory memo', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const keeper = await createMemo(app, cookie, { content: 'still here' });
    const fading = await createMemo(app, cookie, { content: 'gone', dory: true, doryWindow: '1h' });
    db.$client
      .prepare('UPDATE memo SET forget_at = ? WHERE uid = ?')
      .run(Math.floor(Date.now() / 1000) - 60, fading.uid);
    expect(new Set(await draw(app, cookie))).toEqual(new Set([keeper.uid]));
  });

  it('never fishes up a bottle still at sea', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const keeper = await createMemo(app, cookie, { content: 'surfaced' });
    await createMemo(app, cookie, {
      content: 'at sea',
      surfaceAt: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(new Set(await draw(app, cookie))).toEqual(new Set([keeper.uid]));
  });

  it('never fishes up a comment', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const parent = await createMemo(app, cookie, { content: 'parent memo' });
    await jsonRequest(app, 'POST', `/api/v1/memos/${parent.uid}/comments`, { content: 'a reply' }, cookie);
    expect(new Set(await draw(app, cookie))).toEqual(new Set([parent.uid]));
  });

  it("never fishes up another member's memo", async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    const dory = await signup(app, 'dory');
    await createMemo(app, dory, { content: 'dory public', visibility: 'PUBLIC' });
    const mine = await createMemo(app, marlin, { content: 'marlin private' });
    expect(new Set(await draw(app, marlin))).toEqual(new Set([mine.uid]));
  });

  it('never fishes up an archived memo', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const keeper = await createMemo(app, cookie, { content: 'active' });
    const shelved = await createMemo(app, cookie, { content: 'archived' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${shelved.uid}`, { rowStatus: 'ARCHIVED' }, cookie);
    expect(new Set(await draw(app, cookie))).toEqual(new Set([keeper.uid]));
  });

  it('requires a viewer', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'GET', '/api/v1/memos/random');
    expect(response.status).toBe(401);
  });
});
