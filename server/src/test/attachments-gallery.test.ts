import { describe, expect, it } from 'vitest';
import type { AttachmentDto } from '@nemomemo/shared';
import type { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

async function upload(app: Hono<AppEnv>, cookie: string, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', new File(['fake-image-bytes'], name, { type: 'image/png' }));
  const response = await app.request('/api/v1/attachments', {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { attachment: { uid: string } }).attachment.uid;
}

async function listByTag(
  app: Hono<AppEnv>,
  cookie: string,
  tag: string,
): Promise<AttachmentDto[]> {
  const response = await jsonRequest(
    app,
    'GET',
    `/api/v1/attachments?tag=${encodeURIComponent(tag)}`,
    undefined,
    cookie,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { attachments: AttachmentDto[] }).attachments;
}

describe('attachment gallery tag filter', () => {
  it('returns only attachments whose memo carries the tag (ancestors included)', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const tagged = await upload(app, cookie, 'coral.png');
    const other = await upload(app, cookie, 'other.png');
    await upload(app, cookie, 'unlinked.png');
    await createMemo(app, cookie, { content: 'dive #trips/tidepools', attachmentUids: [tagged] });
    await createMemo(app, cookie, { content: 'no tags here', attachmentUids: [other] });

    const exact = await listByTag(app, cookie, 'trips/tidepools');
    expect(exact.map((a) => a.filename)).toEqual(['coral.png']);
    // Ancestor tags are implied in the payload, so filtering by the parent works.
    const parent = await listByTag(app, cookie, 'trips');
    expect(parent.map((a) => a.filename)).toEqual(['coral.png']);
    expect(await listByTag(app, cookie, 'nothing')).toEqual([]);
  });

  it('keeps both time guards: expired dory and pending bottle photos stay hidden', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const doryFile = await upload(app, cookie, 'fading.png');
    const bottleFile = await upload(app, cookie, 'atsea.png');
    const doomed = await createMemo(app, cookie, {
      content: '#pics fading',
      dory: true,
      attachmentUids: [doryFile],
    });
    await createMemo(app, cookie, {
      content: '#pics at sea',
      surfaceAt: Math.floor(Date.now() / 1000) + 3600,
      attachmentUids: [bottleFile],
    });
    db.$client
      .prepare('UPDATE memo SET forget_at = ? WHERE uid = ?')
      .run(Math.floor(Date.now() / 1000) - 10, doomed.uid);

    expect(await listByTag(app, cookie, 'pics')).toEqual([]);
  });

  it('never crosses owners', async () => {
    const { app } = makeTestApp();
    const nemo = await signup(app, 'nemo');
    const marlin = await signup(app, 'marlin');
    const file = await upload(app, nemo, 'mine.png');
    await createMemo(app, nemo, { content: '#shared pic', visibility: 'PUBLIC', attachmentUids: [file] });
    expect(await listByTag(app, marlin, 'shared')).toEqual([]);
  });
});
