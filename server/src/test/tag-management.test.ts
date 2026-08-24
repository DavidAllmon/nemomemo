import { describe, expect, it } from 'vitest';
import type { MemoHistoryResponse } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

type App = Parameters<typeof jsonRequest>[0];

async function rename(app: App, cookie: string, from: string, to: string): Promise<Response> {
  return jsonRequest(app, 'POST', '/api/v1/users/-/tags/rename', { from, to }, cookie);
}

async function tagCounts(app: App, cookie: string): Promise<Record<string, number>> {
  const response = await jsonRequest(app, 'GET', '/api/v1/users/-/tags', undefined, cookie);
  expect(response.status).toBe(200);
  return ((await response.json()) as { tags: Record<string, number> }).tags;
}

async function history(app: App, cookie: string, uid: string): Promise<MemoHistoryResponse> {
  const response = await jsonRequest(app, 'GET', `/api/v1/memos/${uid}/history`, undefined, cookie);
  expect(response.status).toBe(200);
  return (await response.json()) as MemoHistoryResponse;
}

describe('tag rename — rewrites content, keeps history', () => {
  it('rewrites the tag and captures one revision holding the pre-rename words', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const memo = await createMemo(app, cookie, { content: 'notes about #reef today' });
    const response = await rename(app, cookie, 'reef', 'lagoon');
    expect(response.status).toBe(200);
    expect(((await response.json()) as { changed: number }).changed).toBe(1);

    const read = await jsonRequest(app, 'GET', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    const { memo: after } = (await read.json()) as { memo: { content: string; tags: string[] } };
    expect(after.content).toBe('notes about #lagoon today');
    expect(after.tags).toEqual(['lagoon']);

    const { revisions } = await history(app, cookie, memo.uid);
    expect(revisions.map((r) => r.content)).toEqual(['notes about #reef today']);
  });

  it('rewrites descendants too, one revision per touched memo', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const parent = await createMemo(app, cookie, { content: 'top #reef' });
    const child = await createMemo(app, cookie, { content: 'nested #reef/notes here' });
    await rename(app, cookie, 'reef', 'lagoon');
    expect((await history(app, cookie, parent.uid)).revisions).toHaveLength(1);
    const childHistory = await history(app, cookie, child.uid);
    expect(childHistory.revisions.map((r) => r.content)).toEqual(['nested #reef/notes here']);
    const counts = await tagCounts(app, cookie);
    expect(Object.keys(counts).sort()).toEqual(['lagoon', 'lagoon/notes']);
  });

  it('leaves untouched memos without a revision', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const bystander = await createMemo(app, cookie, { content: 'no tags at all' });
    await createMemo(app, cookie, { content: 'has #reef' });
    await rename(app, cookie, 'reef', 'lagoon');
    expect((await history(app, cookie, bystander.uid)).revisions).toHaveLength(0);
  });

  it("never touches another member's memos", async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    const dory = await signup(app, 'dory');
    const theirs = await createMemo(app, dory, { content: 'my own #reef' });
    await rename(app, marlin, 'reef', 'lagoon');
    const read = await jsonRequest(app, 'GET', `/api/v1/memos/${theirs.uid}`, undefined, dory);
    const { memo } = (await read.json()) as { memo: { content: string } };
    expect(memo.content).toBe('my own #reef');
    expect((await history(app, dory, theirs.uid)).revisions).toHaveLength(0);
  });

  it('rejects target names the tokenizer would never match', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    for (const bad of ['a/', 'a//b', '-a', 'a b']) {
      expect((await rename(app, cookie, 'reef', bad)).status, bad).toBe(400);
    }
  });

  it('renaming onto an existing tag merges the counts', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await createMemo(app, cookie, { content: 'one #reef' });
    await createMemo(app, cookie, { content: 'two #reef again' });
    await createMemo(app, cookie, { content: 'three #lagoon' });
    await rename(app, cookie, 'reef', 'lagoon');
    const counts = await tagCounts(app, cookie);
    expect(counts).toEqual({ lagoon: 3 });
  });
});

describe('tag colors — a per-member palette', () => {
  it('persists tagColors through user settings', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const patch = await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/settings',
      { general: { tagColors: { reef: 'coral', 'reef/notes': 'kelp' } } },
      cookie,
    );
    expect(patch.status).toBe(200);
    const read = await jsonRequest(app, 'GET', '/api/v1/users/-/settings', undefined, cookie);
    const { general } = (await read.json()) as { general: { tagColors: Record<string, string> } };
    expect(general.tagColors).toEqual({ reef: 'coral', 'reef/notes': 'kelp' });
  });

  it('rejects colors outside the palette', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const response = await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/settings',
      { general: { tagColors: { reef: 'chartreuse' } } },
      cookie,
    );
    expect(response.status).toBe(400);
  });

  it('accounts saved before the field existed read back an empty map', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const read = await jsonRequest(app, 'GET', '/api/v1/users/-/settings', undefined, cookie);
    const { general } = (await read.json()) as { general: { tagColors: Record<string, string> } };
    expect(general.tagColors).toEqual({});
  });
});
