import { describe, expect, it } from 'vitest';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

interface InboxItem {
  type: string;
  sender: { username: string } | null;
  memoSnippet: string | null;
}

async function inboxOf(app: Parameters<typeof jsonRequest>[0], cookie: string): Promise<InboxItem[]> {
  const response = await jsonRequest(app, 'GET', '/api/v1/inbox', undefined, cookie);
  expect(response.status).toBe(200);
  return ((await response.json()) as { items: InboxItem[] }).items;
}

async function comment(
  app: Parameters<typeof jsonRequest>[0],
  cookie: string,
  uid: string,
  content: string,
): Promise<void> {
  const response = await jsonRequest(app, 'POST', `/api/v1/memos/${uid}/comments`, { content }, cookie);
  expect(response.status).toBe(201);
}

describe('comment thread subscriptions', () => {
  it('notifies earlier commenters when the thread continues', async () => {
    const { app } = makeTestApp();
    const anemone = await signup(app, 'anemone');
    const bubbles = await signup(app, 'bubbles');
    const crush = await signup(app, 'crush');
    const memo = await createMemo(app, anemone, { content: 'Thread test', visibility: 'PUBLIC' });

    await comment(app, bubbles, memo.uid, 'first!');
    await comment(app, crush, memo.uid, 'second!');

    // The owner hears about both comments the classic way.
    const ownerItems = await inboxOf(app, anemone);
    expect(ownerItems.filter((i) => i.type === 'MEMO_COMMENT')).toHaveLength(2);
    expect(ownerItems.filter((i) => i.type === 'MEMO_THREAD')).toHaveLength(0);

    // bubbles commented earlier, so crush's reply reaches them as a thread ping.
    const bubblesItems = await inboxOf(app, bubbles);
    const threadPings = bubblesItems.filter((i) => i.type === 'MEMO_THREAD');
    expect(threadPings).toHaveLength(1);
    expect(threadPings[0]!.sender?.username).toBe('crush');
    expect(threadPings[0]!.memoSnippet).toContain('second');

    // crush joined last — nothing has happened since, and never self-notify.
    expect(await inboxOf(app, crush)).toHaveLength(0);
  });

  it('notifies participants when the memo owner replies', async () => {
    const { app } = makeTestApp();
    const anemone = await signup(app, 'anemone');
    const bubbles = await signup(app, 'bubbles');
    const memo = await createMemo(app, anemone, { content: 'Owner replies', visibility: 'PUBLIC' });

    await comment(app, bubbles, memo.uid, 'question?');
    await comment(app, anemone, memo.uid, 'answer!');

    const bubblesItems = await inboxOf(app, bubbles);
    const threadPings = bubblesItems.filter((i) => i.type === 'MEMO_THREAD');
    expect(threadPings).toHaveLength(1);
    expect(threadPings[0]!.sender?.username).toBe('anemone');

    // The owner never gets a MEMO_COMMENT for their own reply.
    const ownerItems = await inboxOf(app, anemone);
    expect(ownerItems.filter((i) => i.type === 'MEMO_COMMENT')).toHaveLength(1);
  });

  it('does not double-notify a participant who was mentioned in the reply', async () => {
    const { app } = makeTestApp();
    const anemone = await signup(app, 'anemone');
    const bubbles = await signup(app, 'bubbles');
    const crush = await signup(app, 'crush');
    const memo = await createMemo(app, anemone, { content: 'Dedupe test', visibility: 'PUBLIC' });

    await comment(app, bubbles, memo.uid, 'first!');
    await comment(app, crush, memo.uid, 'hey @bubbles look at this');

    const bubblesItems = await inboxOf(app, bubbles);
    expect(bubblesItems.filter((i) => i.type === 'MEMO_MENTION')).toHaveLength(1);
    expect(bubblesItems.filter((i) => i.type === 'MEMO_THREAD')).toHaveLength(0);
  });

  it('one commenter gets one thread ping per reply, however often they commented', async () => {
    const { app } = makeTestApp();
    const anemone = await signup(app, 'anemone');
    const bubbles = await signup(app, 'bubbles');
    const crush = await signup(app, 'crush');
    const memo = await createMemo(app, anemone, { content: 'Dedupe x2', visibility: 'PUBLIC' });

    await comment(app, bubbles, memo.uid, 'one');
    await comment(app, bubbles, memo.uid, 'two');
    await comment(app, crush, memo.uid, 'three');

    const bubblesItems = await inboxOf(app, bubbles);
    expect(bubblesItems.filter((i) => i.type === 'MEMO_THREAD')).toHaveLength(1);
  });
});
