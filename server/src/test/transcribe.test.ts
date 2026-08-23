import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { Db } from '../db/index.js';
import type { AppEnv } from '../middleware/auth.js';
import { transcribeEngine } from '../services/transcribe.js';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

async function uploadAudio(app: Hono<AppEnv>, cookie: string, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', new File(['fake-audio-bytes'], name, { type: 'audio/webm' }));
  const response = await app.request('/api/v1/attachments', {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { attachment: { uid: string } }).attachment.uid;
}

describe('voice transcription', () => {
  it('stores the transcript and search finds the memo through it', async () => {
    const { app, db, transcribe } = makeTestApp(
      {},
      { transcribeEngine: { recognize: async () => 'remember to book the ferry tickets' } },
    );
    const cookie = await signup(app, 'nemo');
    const uid = await uploadAudio(app, cookie, 'voice-memo.webm');
    await transcribe!.idle();
    const row = db.$client
      .prepare('SELECT extracted_text FROM attachment WHERE uid = ?')
      .get(uid) as { extracted_text: string };
    expect(row.extracted_text).toBe('remember to book the ferry tickets');

    const create = await jsonRequest(
      app,
      'POST',
      '/api/v1/memos',
      { content: 'voice note from the car', attachmentUids: [uid] },
      cookie,
    );
    expect(create.status).toBe(201);
    const found = await jsonRequest(
      app,
      'GET',
      `/api/v1/memos?scope=home&filter=${encodeURIComponent('content.contains("ferry")')}`,
      undefined,
      cookie,
    );
    const memos = ((await found.json()) as { memos: { content: string }[] }).memos;
    expect(memos.map((memo) => memo.content)).toEqual(['voice note from the car']);
  });

  it('no transcription configured (test default) → uploads fine, no queue', async () => {
    const { app, transcribe } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    await uploadAudio(app, cookie, 'plain.webm');
    expect(transcribe).toBeNull();
  });
});

describe('transcribeEngine HTTP client', () => {
  it('POSTs multipart with bearer + model and returns json.text', async () => {
    const seen: { url?: string; auth?: string | null; model?: string; filename?: string } = {};
    const fakeFetch: typeof fetch = async (input, init) => {
      seen.url = String(input);
      const headers = new Headers(init?.headers);
      seen.auth = headers.get('authorization');
      const form = init?.body as FormData;
      seen.model = String(form.get('model'));
      seen.filename = (form.get('file') as File).name;
      return new Response(JSON.stringify({ text: ' hello reef ' }), { status: 200 });
    };
    const engine = transcribeEngine(
      'http://stub.local/v1/audio/transcriptions',
      'sk-test',
      'whisper-1',
      fakeFetch,
    );
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-'));
    const clip = path.join(d, 'clip.webm');
    fs.writeFileSync(clip, 'bytes');
    expect(await engine.recognize(clip)).toBe(' hello reef ');
    expect(seen.url).toBe('http://stub.local/v1/audio/transcriptions');
    expect(seen.auth).toBe('Bearer sk-test');
    expect(seen.model).toBe('whisper-1');
    expect(seen.filename).toBe('clip.webm');
  });

  it('throws on non-2xx so the queue can swallow and warn', async () => {
    const fakeFetch: typeof fetch = async () => new Response('nope', { status: 500 });
    const engine = transcribeEngine('http://stub.local/x', null, 'whisper-1', fakeFetch);
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-'));
    const file = path.join(d, 'clip.webm');
    fs.writeFileSync(file, 'bytes');
    await expect(engine.recognize(file)).rejects.toThrow();
  });
});
