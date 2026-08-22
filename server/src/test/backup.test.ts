import { describe, expect, it } from 'vitest';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

describe('reef backup download', () => {
  it('admins get a zip containing the database and uploads; others are refused', async () => {
    const { app } = makeTestApp();
    const adminCookie = await signup(app, 'reefkeeper');
    const memberCookie = await signup(app, 'guppy');

    // An upload so the zip has an uploads/ entry too.
    const form = new FormData();
    form.append('file', new File(['treasure map'], 'map.txt', { type: 'text/plain' }));
    const upload = await app.request('/api/v1/attachments', {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: form,
    });
    expect(upload.status).toBe(201);

    const response = await jsonRequest(app, 'GET', '/api/v1/instance/backup', undefined, adminCookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('nemomemo-backup-');

    const bytes = Buffer.from(await response.arrayBuffer());
    // Zip magic + plaintext entry names in local file headers.
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const raw = bytes.toString('latin1');
    expect(raw).toContain('nemomemo.db');
    expect(raw).toContain('map.txt');

    const member = await jsonRequest(app, 'GET', '/api/v1/instance/backup', undefined, memberCookie);
    expect(member.status).toBe(403);
    const anonymous = await jsonRequest(app, 'GET', '/api/v1/instance/backup');
    expect(anonymous.status).toBe(401);
  });
});
