import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { Db } from '../db/index.js';
import type { AppEnv } from '../middleware/auth.js';
import { makeTestApp, signup } from './helpers.js';

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
