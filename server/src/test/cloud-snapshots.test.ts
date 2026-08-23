import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { makeCloudApp } from '../cloud/app.js';
import { Registry } from '../cloud/registry.js';
import { ReefFleet } from '../cloud/tenants.js';
import {
  enqueueRestore,
  readRestoreStatus,
  readSnapshotManifest,
  restorePaths,
  snapshotsForReef,
  writeRestoreStatus,
  type RestoreStatus,
} from '../cloud/snapshots.js';

const MANIFEST = [
  { id: 'aaa111bb', time: '2026-08-22T07:17:01Z', reefs: ['coral', 'anemone'] },
  { id: 'bbb222cc', time: '2026-08-21T07:17:01Z', reefs: ['anemone'] },
  { id: 'ccc333dd', time: '2026-08-20T07:17:01Z', reefs: null },
];

function emptyDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-snap-test-'));
}

function scratchDataDir(manifest: unknown = MANIFEST): string {
  const dir = emptyDataDir();
  fs.writeFileSync(path.join(dir, 'snapshots.json'), JSON.stringify(manifest));
  return dir;
}

describe('snapshot manifest', () => {
  it('reads the manifest and filters to snapshots that hold the reef, newest first', () => {
    const dataDir = scratchDataDir();
    expect(readSnapshotManifest(dataDir)).toHaveLength(3);
    const coral = snapshotsForReef(dataDir, 'coral');
    expect(coral.map((s) => s.id)).toEqual(['aaa111bb']); // null-reef entries excluded
    const anemone = snapshotsForReef(dataDir, 'anemone');
    expect(anemone.map((s) => s.id)).toEqual(['aaa111bb', 'bbb222cc']);
  });

  it('treats a missing or corrupt manifest as empty', () => {
    const missing = emptyDataDir();
    expect(readSnapshotManifest(missing)).toEqual([]);
    const corrupt = scratchDataDir();
    fs.writeFileSync(path.join(corrupt, 'snapshots.json'), 'not json');
    expect(readSnapshotManifest(corrupt)).toEqual([]);
  });
});

describe('restore status + queue files', () => {
  it('round-trips status and returns null when absent', () => {
    const dataDir = scratchDataDir();
    expect(readRestoreStatus(dataDir, 'coral')).toBeNull();
    const status: RestoreStatus = {
      state: 'queued',
      snapshotId: 'aaa111bb',
      requestedTs: 100,
      requestedBy: 'reefkeeper',
      updatedTs: 100,
    };
    writeRestoreStatus(dataDir, 'coral', status);
    expect(readRestoreStatus(dataDir, 'coral')).toEqual(status);
  });

  it('enqueueRestore writes the queue file and a queued status', () => {
    const dataDir = scratchDataDir();
    const status = enqueueRestore(dataDir, 'coral', { snapshotId: 'aaa111bb', requestedBy: 'reefkeeper' });
    expect(status.state).toBe('queued');
    const queued = JSON.parse(
      fs.readFileSync(path.join(restorePaths(dataDir).queueDir, 'coral.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(queued.slug).toBe('coral');
    expect(queued.snapshotId).toBe('aaa111bb');
    expect(queued.requestedBy).toBe('reefkeeper');
    expect(readRestoreStatus(dataDir, 'coral')?.state).toBe('queued');
  });
});

const BASE_DOMAIN = 'reef.test';

function makeSnapshotTestContext(): { app: Hono; scratch: string } {
  const scratch = scratchDataDir();
  const base = loadConfig({ dataDir: scratch, webDistDir: null });
  const registry = new Registry(path.join(scratch, 'registry.db'));
  registry.createReef('coral', { status: 'active' });
  const fleet = new ReefFleet(base, path.join(scratch, 'reefs'));
  const app = makeCloudApp(registry, fleet, { baseDomain: BASE_DOMAIN, appHost: `app.${BASE_DOMAIN}` }, scratch);
  return { app, scratch };
}

async function hostRequest(
  app: Hono,
  method: string,
  host: string,
  pathname: string,
  body?: unknown,
  cookie?: string,
): Promise<Response> {
  return app.request(`http://${host}${pathname}`, {
    method,
    headers: {
      host,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function hostSignup(app: Hono, host: string, username: string): Promise<string> {
  const response = await hostRequest(app, 'POST', host, '/api/v1/auth/signup', {
    username,
    email: `${username}@${host}`,
    password: 'password123',
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

describe('GET/POST /api/v1/cloud/snapshots', () => {
  const host = `coral.${BASE_DOMAIN}`;

  it("reefkeeper sees only this reef's snapshot dates; members and anonymous are refused", async () => {
    const { app } = makeSnapshotTestContext();
    const keeper = await hostSignup(app, host, 'keeper'); // first signup = ADMIN
    const member = await hostSignup(app, host, 'guppy');

    const ok = await hostRequest(app, 'GET', host, '/api/v1/cloud/snapshots', undefined, keeper);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { snapshots: { id: string }[]; restore: unknown };
    expect(body.snapshots.map((s) => s.id)).toEqual(['aaa111bb']);
    expect(body.restore).toBeNull();

    expect((await hostRequest(app, 'GET', host, '/api/v1/cloud/snapshots', undefined, member)).status).toBe(403);
    expect((await hostRequest(app, 'GET', host, '/api/v1/cloud/snapshots')).status).toBe(403);
  });

  it('restore request queues once, refuses unknown snapshots and double-requests', async () => {
    const { app, scratch } = makeSnapshotTestContext();
    const keeper = await hostSignup(app, host, 'keeper');

    const unknown = await hostRequest(app, 'POST', host, '/api/v1/cloud/snapshots/restore', { snapshotId: 'nope0000' }, keeper);
    expect(unknown.status).toBe(404);
    // bbb222cc exists but holds only anemone — coral can't restore to it.
    const wrongReef = await hostRequest(app, 'POST', host, '/api/v1/cloud/snapshots/restore', { snapshotId: 'bbb222cc' }, keeper);
    expect(wrongReef.status).toBe(404);

    const ok = await hostRequest(app, 'POST', host, '/api/v1/cloud/snapshots/restore', { snapshotId: 'aaa111bb' }, keeper);
    expect(ok.status).toBe(202);
    expect(((await ok.json()) as { restore: { state: string } }).restore.state).toBe('queued');
    expect(fs.existsSync(path.join(scratch, 'restore', 'queue', 'coral.json'))).toBe(true);

    const again = await hostRequest(app, 'POST', host, '/api/v1/cloud/snapshots/restore', { snapshotId: 'aaa111bb' }, keeper);
    expect(again.status).toBe(409);
  });
});
