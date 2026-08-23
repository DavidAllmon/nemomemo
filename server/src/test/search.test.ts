import { describe, expect, it } from 'vitest';
import type { MemoListResponse } from '@nemomemo/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { memos } from '../db/schema.js';
import { toFtsMatchQuery } from '../services/filter-sql.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

async function search(
  app: Parameters<typeof jsonRequest>[0],
  expression: string,
  cookie: string,
): Promise<string[]> {
  const response = await jsonRequest(
    app,
    'GET',
    `/api/v1/memos?scope=home&filter=${encodeURIComponent(expression)}`,
    undefined,
    cookie,
  );
  if (response.status !== 200) {
    throw new Error(`search failed: ${response.status} ${await response.text()}`);
  }
  return ((await response.json()) as MemoListResponse).memos.map((memo) => memo.content);
}

function ftsIds(db: Db, match: string): number[] {
  return (
    db.$client.prepare('SELECT rowid FROM memo_fts WHERE memo_fts MATCH ?').all(match) as {
      rowid: number;
    }[]
  ).map((row) => row.rowid);
}

describe('toFtsMatchQuery', () => {
  it('quotes a single word with prefix', () => {
    expect(toFtsMatchQuery('reef')).toBe('"reef"*');
  });

  it('keeps multi-word input as one phrase with trailing prefix', () => {
    expect(toFtsMatchQuery('coral reef')).toBe('"coral reef"*');
  });

  it('strips FTS syntax and punctuation down to tokens', () => {
    expect(toFtsMatchQuery('reef AND (kelp) OR "x"')).toBe('"reef AND kelp OR x"*');
  });

  it('returns null when nothing is indexable', () => {
    expect(toFtsMatchQuery('!!! ???')).toBeNull();
    expect(toFtsMatchQuery('🐠')).toBeNull();
    expect(toFtsMatchQuery('')).toBeNull();
  });
});

describe('memo_fts stays in sync via triggers', () => {
  it('indexes new memos via the insert trigger', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await createMemo(app, cookie, { content: 'anemone home' });
    expect(ftsIds(db, '"anemone"')).toHaveLength(1);
  });

  it('re-indexes on content update and de-indexes on delete', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'barnacle' });
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { content: 'kelp forest' }, cookie);
    expect(ftsIds(db, '"barnacle"')).toHaveLength(0);
    expect(ftsIds(db, '"kelp"')).toHaveLength(1);
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${memo.uid}`, undefined, cookie);
    expect(ftsIds(db, '"kelp"')).toHaveLength(0);
  });
});

describe('search via content.contains (FTS-backed)', () => {
  it('finds by word, prefix, and accent-insensitively; misses mid-word substrings', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await createMemo(app, cookie, { content: 'Swimming lessons at the café' });
    await createMemo(app, cookie, { content: 'Nothing relevant' });

    expect(await search(app, 'content.contains("swim")', cookie)).toEqual([
      'Swimming lessons at the café',
    ]);
    expect(await search(app, 'content.contains("cafe")', cookie)).toEqual([
      'Swimming lessons at the café',
    ]);
    // Word-prefix search, not substring: mid-word fragments no longer match.
    expect(await search(app, 'content.contains("immi")', cookie)).toEqual([]);
  });

  it('multi-word search matches the phrase across punctuation', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await createMemo(app, cookie, { content: 'coral, reef notes' });
    await createMemo(app, cookie, { content: 'reef first, coral later' });
    expect(await search(app, 'content.contains("coral reef")', cookie)).toEqual([
      'coral, reef notes',
    ]);
  });

  it('punctuation-only search falls back to LIKE and still matches', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await createMemo(app, cookie, { content: 'look ::: here' });
    await createMemo(app, cookie, { content: 'plain memo' });
    expect(await search(app, 'content.contains(":::")', cookie)).toEqual(['look ::: here']);
  });

  it('startsWith/endsWith keep exact positional semantics', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await createMemo(app, cookie, { content: 'Swim lessons daily' });
    expect(await search(app, 'content.startsWith("Swim")', cookie)).toEqual([
      'Swim lessons daily',
    ]);
    expect(await search(app, 'content.startsWith("lessons")', cookie)).toEqual([]);
    expect(await search(app, 'content.endsWith("daily")', cookie)).toEqual([
      'Swim lessons daily',
    ]);
  });

  it('never leaks through time guards: expired dory + pending bottle stay hidden', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const doomed = await createMemo(app, cookie, { content: 'seagrass secret', dory: true });
    await createMemo(app, cookie, {
      content: 'seagrass at sea',
      surfaceAt: Math.floor(Date.now() / 1000) + 3600,
    });
    // Rewind the dory memo past expiry — unswept, but reads must not depend on the sweeper.
    db.update(memos)
      .set({ forgetAt: Math.floor(Date.now() / 1000) - 10 })
      .where(eq(memos.uid, doomed.uid))
      .run();
    // Both rows still sit in memo_fts; the outer guards must hide them anyway.
    expect(await search(app, 'content.contains("seagrass")', cookie)).toEqual([]);
  });

  it('comments never surface as top-level search results', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'parent memo' });
    const response = await jsonRequest(
      app,
      'POST',
      `/api/v1/memos/${memo.uid}/comments`,
      { content: 'wondrous whalesong' },
      cookie,
    );
    expect(response.status).toBe(201);
    expect(await search(app, 'content.contains("whalesong")', cookie)).toEqual([]);
  });

  it('negated and combined filters still compile', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await createMemo(app, cookie, { content: 'kelp forest' });
    await createMemo(app, cookie, { content: 'open water' });
    expect(await search(app, '!content.contains("kelp") && !pinned', cookie)).toEqual([
      'open water',
    ]);
  });
});
