import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { Db } from '../db/index.js';
import type { AppEnv } from '../middleware/auth.js';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

async function search(
  app: Hono<AppEnv>,
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
  expect(response.status).toBe(200);
  return ((await response.json()) as { memos: { content: string }[] }).memos.map(
    (memo) => memo.content,
  );
}

async function uploadImage(app: Hono<AppEnv>, cookie: string, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', new File(['fake-png-bytes'], name, { type: 'image/png' }));
  const response = await app.request('/api/v1/attachments', {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { attachment: { uid: string } }).attachment.uid;
}

function attachmentFtsIds(db: Db, match: string): number[] {
  return (
    db.$client
      .prepare('SELECT rowid FROM attachment_fts WHERE attachment_fts MATCH ?')
      .all(match) as { rowid: number }[]
  ).map((row) => row.rowid);
}

describe('attachment_fts stays in sync via triggers', () => {
  it('indexes extracted text on update and de-indexes on delete', async () => {
    const { app, db } = makeTestApp();
    await signup(app, 'nemo');
    db.$client
      .prepare(
        "INSERT INTO attachment (uid, creator_id, filename, type, size, storage_path) VALUES ('att1', 1, 'pic.png', 'image/png', 10, 'assets/pic.png')",
      )
      .run();
    db.$client
      .prepare("UPDATE attachment SET extracted_text = 'RECEIPT total 42' WHERE uid = 'att1'")
      .run();
    expect(attachmentFtsIds(db, '"receipt"')).toHaveLength(1);
    db.$client.prepare("DELETE FROM attachment WHERE uid = 'att1'").run();
    expect(attachmentFtsIds(db, '"receipt"')).toHaveLength(0);
  });
});

describe('OCR queue', () => {
  it('extracts text after an image upload and indexes it', async () => {
    const { app, db, ocr } = makeTestApp({}, { ocrEngine: { recognize: async () => 'WHITEBOARD kelp budget' } });
    const cookie = await signup(app, 'nemo');
    const uid = await uploadImage(app, cookie, 'board.png');
    await ocr!.idle();
    const row = db.$client
      .prepare('SELECT extracted_text FROM attachment WHERE uid = ?')
      .get(uid) as { extracted_text: string };
    expect(row.extracted_text).toBe('WHITEBOARD kelp budget');
    expect(attachmentFtsIds(db, '"whiteboard"')).toHaveLength(1);
  });

  it('an engine failure never breaks the upload', async () => {
    const { app, db, ocr } = makeTestApp(
      {},
      { ocrEngine: { recognize: async () => { throw new Error('wasm exploded'); } } },
    );
    const cookie = await signup(app, 'nemo');
    const uid = await uploadImage(app, cookie, 'bad.png');
    await ocr!.idle();
    const row = db.$client
      .prepare('SELECT extracted_text FROM attachment WHERE uid = ?')
      .get(uid) as { extracted_text: string };
    expect(row.extracted_text).toBe('');
  });

  it('runs no OCR when disabled (test default)', async () => {
    const { app, ocr } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await uploadImage(app, cookie, 'plain.png');
    expect(ocr).toBeNull();
  });
});

describe('search reaches OCR text', () => {
  it('finds a memo through its attachment text; unlinked text matches nothing', async () => {
    const { app, db, ocr } = makeTestApp({}, { ocrEngine: { recognize: async () => 'SURFBOARD rental receipt' } });
    const cookie = await signup(app, 'nemo');
    const linked = await uploadImage(app, cookie, 'receipt.png');
    await uploadImage(app, cookie, 'floating.png'); // never linked to a memo
    await ocr!.idle();
    const create = await jsonRequest(
      app,
      'POST',
      '/api/v1/memos',
      { content: 'photo from the shop', attachmentUids: [linked] },
      cookie,
    );
    expect(create.status).toBe(201);

    const hits = await search(app, 'content.contains("surfboard")', cookie);
    expect(hits).toEqual(['photo from the shop']);
    void db;
  });

  it('attachment text never leaks across visibility', async () => {
    const { app, ocr } = makeTestApp({}, { ocrEngine: { recognize: async () => 'SECRETWORD here' } });
    const owner = await signup(app, 'nemo');
    const friend = await signup(app, 'marlin');
    const uid = await uploadImage(app, owner, 'private.png');
    await ocr!.idle();
    await jsonRequest(
      app,
      'POST',
      '/api/v1/memos',
      { content: 'private pic', visibility: 'PRIVATE', attachmentUids: [uid] },
      owner,
    );
    const response = await jsonRequest(
      app,
      'GET',
      `/api/v1/memos?scope=explore&filter=${encodeURIComponent('content.contains("secretword")')}`,
      undefined,
      friend,
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { memos: unknown[] }).memos).toEqual([]);
  });
});
