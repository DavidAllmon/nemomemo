import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

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

  it('restore round-trip: the reef becomes exactly the backup, with safety copies', async () => {
    // File-backed database so the swap is observable on disk.
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-restore-test-'));
    const requestRestart = vi.fn();
    const { app, config } = makeTestApp({
      dbPath: path.join(scratch, 'nemomemo.db'),
      dataDir: scratch,
      uploadsDir: path.join(scratch, 'uploads'),
      requestRestart,
    });
    const cookie = await signup(app, 'reefkeeper');
    await createMemo(app, cookie, { content: 'memo from the good old days' });

    const backup = await jsonRequest(app, 'GET', '/api/v1/instance/backup', undefined, cookie);
    expect(backup.status).toBe(200);
    const zipBytes = Buffer.from(await backup.arrayBuffer());

    await createMemo(app, cookie, { content: 'memo made AFTER the backup' });

    const form = new FormData();
    form.append('file', new File([zipBytes], 'nemomemo-backup.zip', { type: 'application/zip' }));
    const restore = await app.request('/api/v1/instance/restore', {
      method: 'POST',
      headers: { cookie },
      body: form,
    });
    expect(restore.status).toBe(200);
    expect(((await restore.json()) as { restarting: boolean }).restarting).toBe(true);
    expect(requestRestart).toHaveBeenCalledOnce();

    // On disk, the database is now the backup: one memo, not two.
    const restored = new Database(config.dbPath, { readonly: true });
    const memos = restored.prepare('SELECT content FROM memo').all() as { content: string }[];
    restored.close();
    expect(memos.map((m) => m.content)).toEqual(['memo from the good old days']);

    // The pre-restore data was set aside, not destroyed.
    expect(fs.readdirSync(scratch).some((f) => f.startsWith('nemomemo.db.pre-restore-'))).toBe(true);

    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('restore refuses garbage zips and refuses entirely on cloud reefs', async () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-restore-bad-'));
    const { app } = makeTestApp({ dbPath: path.join(scratch, 'nemomemo.db'), dataDir: scratch });
    const cookie = await signup(app, 'reefkeeper');

    const junk = new FormData();
    junk.append('file', new File(['not a zip at all'], 'junk.zip', { type: 'application/zip' }));
    const bad = await app.request('/api/v1/instance/restore', { method: 'POST', headers: { cookie }, body: junk });
    expect(bad.status).toBe(500); // unreadable zip; nothing changed
    expect(fs.readdirSync(scratch).some((f) => f.includes('pre-restore'))).toBe(false);

    // Cloud reefs (cloudLimits set) are managed — restore-by-upload is refused.
    const cloud = makeTestApp({ cloudLimits: { maxMembers: 25, maxStorageBytes: 1024 } });
    const cloudCookie = await signup(cloud.app, 'reefkeeper');
    const form = new FormData();
    form.append('file', new File(['x'], 'b.zip', { type: 'application/zip' }));
    const refused = await cloud.app.request('/api/v1/instance/restore', {
      method: 'POST',
      headers: { cookie: cloudCookie },
      body: form,
    });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(await refused.json())).toContain('backed up automatically');

    fs.rmSync(scratch, { recursive: true, force: true });
  });
});
