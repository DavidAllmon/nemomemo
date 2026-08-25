import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { makeCloudApp } from '../cloud/app.js';
import { Registry } from '../cloud/registry.js';
import { ReefFleet } from '../cloud/tenants.js';

const BASE_DOMAIN = 'reef.test';
const APP_HOST = `app.${BASE_DOMAIN}`;

interface CloudTestContext {
  app: Hono;
  registry: Registry;
  fleet: ReefFleet;
  scratch: string;
}

function makeCloudTestContext(maxOpen = 64): CloudTestContext {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-cloud-test-'));
  const base = loadConfig({ dataDir: scratch, webDistDir: null });
  const registry = new Registry(path.join(scratch, 'registry.db'));
  const fleet = new ReefFleet(base, path.join(scratch, 'reefs'), maxOpen);
  const app = makeCloudApp(registry, fleet, { baseDomain: BASE_DOMAIN, appHost: APP_HOST }, scratch);
  return { app, registry, fleet, scratch };
}

async function reefRequest(
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

async function reefSignup(app: Hono, host: string, username: string): Promise<string> {
  const response = await reefRequest(app, 'POST', host, '/api/v1/auth/signup', {
    username,
    email: `${username}@${host}`,
    password: 'password123',
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

async function reefCreateMemo(
  app: Hono,
  host: string,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ uid: string }> {
  const response = await reefRequest(app, 'POST', host, '/api/v1/memos', body, cookie);
  expect(response.status).toBe(201);
  return ((await response.json()) as { memo: { uid: string } }).memo;
}

describe('cloud cross-tenant isolation', () => {
  let ctx: CloudTestContext;
  const coral = `coral.${BASE_DOMAIN}`;
  const shell = `shell.${BASE_DOMAIN}`;

  beforeEach(() => {
    ctx = makeCloudTestContext();
    ctx.registry.createReef('coral', { status: 'active' });
    ctx.registry.createReef('shell', { status: 'active' });
  });

  afterEach(() => {
    ctx.fleet.closeAll();
    ctx.registry.close();
    fs.rmSync(ctx.scratch, { recursive: true, force: true });
  });

  it('the same username can exist independently on two reefs, each its own admin', async () => {
    const coralCookie = await reefSignup(ctx.app, coral, 'nemo');
    const shellCookie = await reefSignup(ctx.app, shell, 'nemo');

    for (const [host, cookie] of [
      [coral, coralCookie],
      [shell, shellCookie],
    ] as const) {
      const me = await reefRequest(ctx.app, 'GET', host, '/api/v1/auth/me', undefined, cookie);
      expect(me.status).toBe(200);
      const { user } = (await me.json()) as { user: { username: string; role: string } };
      expect(user.username).toBe('nemo');
      expect(user.role).toBe('ADMIN');
    }
  });

  it('a session cookie from one reef is worthless on another', async () => {
    const coralCookie = await reefSignup(ctx.app, coral, 'nemo');
    await reefSignup(ctx.app, shell, 'pearl');

    const replayed = await reefRequest(ctx.app, 'GET', shell, '/api/v1/auth/me', undefined, coralCookie);
    expect(replayed.status).toBe(401);
  });

  it('an access token from one reef is worthless on another', async () => {
    const coralCookie = await reefSignup(ctx.app, coral, 'nemo');
    await reefSignup(ctx.app, shell, 'pearl');

    const minted = await reefRequest(ctx.app, 'POST', coral, '/api/v1/tokens', { name: 'cli' }, coralCookie);
    expect(minted.status).toBe(201);
    const { plaintext } = (await minted.json()) as { plaintext: string };

    // Works on its own reef…
    const own = await ctx.app.request(`http://${coral}/api/v1/auth/me`, {
      headers: { host: coral, authorization: `Bearer ${plaintext}` },
    });
    expect(own.status).toBe(200);

    // …and is anonymous on any other, because each reef has its own database.
    const replayed = await ctx.app.request(`http://${shell}/api/v1/auth/me`, {
      headers: { host: shell, authorization: `Bearer ${plaintext}` },
    });
    expect(replayed.status).toBe(401);
  });

  it('signin fails on a reef where the user does not exist', async () => {
    await reefSignup(ctx.app, coral, 'nemo');
    await reefSignup(ctx.app, shell, 'pearl');

    const response = await reefRequest(ctx.app, 'POST', shell, '/api/v1/auth/signin', {
      username: 'nemo',
      email: 'nemo-two@reef.test',
      password: 'password123',
    });
    expect(response.status).toBe(401);
  });

  it('memos never cross reefs: direct fetch, feed, and explore', async () => {
    const coralCookie = await reefSignup(ctx.app, coral, 'nemo');
    const shellCookie = await reefSignup(ctx.app, shell, 'pearl');
    const memo = await reefCreateMemo(ctx.app, coral, coralCookie, {
      content: 'coral secret #treasure',
      visibility: 'PUBLIC',
    });

    // Direct fetch by uid on the other reef: not found, even for its admin.
    const direct = await reefRequest(
      ctx.app,
      'GET',
      shell,
      `/api/v1/memos/${memo.uid}`,
      undefined,
      shellCookie,
    );
    expect(direct.status).toBe(404);

    // Explore on the other reef never lists it, even though it is PUBLIC.
    const explore = await reefRequest(
      ctx.app,
      'GET',
      shell,
      '/api/v1/memos?scope=explore',
      undefined,
      shellCookie,
    );
    expect(explore.status).toBe(200);
    const { memos } = (await explore.json()) as { memos: { uid: string }[] };
    expect(memos.some((m) => m.uid === memo.uid)).toBe(false);

    // Sanity: the home reef does see it.
    const home = await reefRequest(
      ctx.app,
      'GET',
      coral,
      `/api/v1/memos/${memo.uid}`,
      undefined,
      coralCookie,
    );
    expect(home.status).toBe(200);
  });

  it('attachments and their files are invisible across reefs', async () => {
    const coralCookie = await reefSignup(ctx.app, coral, 'nemo');
    const shellCookie = await reefSignup(ctx.app, shell, 'pearl');

    const form = new FormData();
    form.append('file', new File(['sunken gold'], 'gold.txt', { type: 'text/plain' }));
    const upload = await ctx.app.request(`http://${coral}/api/v1/attachments`, {
      method: 'POST',
      headers: { host: coral, cookie: coralCookie },
      body: form,
    });
    expect(upload.status).toBe(201);
    const { attachment } = (await upload.json()) as { attachment: { uid: string } };

    // The raw file server on the other reef has never heard of it.
    const cross = await reefRequest(
      ctx.app,
      'GET',
      shell,
      `/file/attachments/${attachment.uid}`,
      undefined,
      shellCookie,
    );
    expect(cross.status).toBe(404);

    // And on disk it lives under the owning reef's directory only.
    const coralAssets = path.join(ctx.scratch, 'reefs', 'coral', 'uploads', 'assets');
    expect(fs.readdirSync(coralAssets).some((f) => f.endsWith('gold.txt'))).toBe(true);
    expect(fs.existsSync(path.join(ctx.scratch, 'reefs', 'shell', 'uploads', 'assets'))).toBe(false);

    const own = await reefRequest(
      ctx.app,
      'GET',
      coral,
      `/file/attachments/${attachment.uid}`,
      undefined,
      coralCookie,
    );
    expect(own.status).toBe(200);
    expect(await own.text()).toBe('sunken gold');
  });

  it('instance settings are per-reef', async () => {
    const coralCookie = await reefSignup(ctx.app, coral, 'nemo');
    await reefSignup(ctx.app, shell, 'pearl');

    const patch = await reefRequest(
      ctx.app,
      'PATCH',
      coral,
      '/api/v1/instance/settings',
      { general: { name: 'Coral Cove' } },
      coralCookie,
    );
    expect(patch.status).toBe(200);

    const coralProfile = await reefRequest(ctx.app, 'GET', coral, '/api/v1/instance/profile');
    expect(((await coralProfile.json()) as { name: string }).name).toBe('Coral Cove');

    const shellProfile = await reefRequest(ctx.app, 'GET', shell, '/api/v1/instance/profile');
    expect(((await shellProfile.json()) as { name: string }).name).not.toBe('Coral Cove');
  });

  it('reef data survives LRU eviction and reopening', async () => {
    const small = makeCloudTestContext(1);
    try {
      small.registry.createReef('coral', { status: 'active' });
      small.registry.createReef('shell', { status: 'active' });

      const coralCookie = await reefSignup(small.app, coral, 'nemo');
      const memo = await reefCreateMemo(small.app, coral, coralCookie, { content: 'persist me' });

      // Touching the second reef evicts the first (maxOpen = 1).
      await reefSignup(small.app, shell, 'pearl');
      expect(small.fleet.openHandles().map((h) => h.slug)).toEqual(['shell']);

      // Coming back reopens the same database file: session + memo intact.
      const me = await reefRequest(small.app, 'GET', coral, '/api/v1/auth/me', undefined, coralCookie);
      expect(me.status).toBe(200);
      const fetched = await reefRequest(
        small.app,
        'GET',
        coral,
        `/api/v1/memos/${memo.uid}`,
        undefined,
        coralCookie,
      );
      expect(fetched.status).toBe(200);
    } finally {
      small.fleet.closeAll();
      small.registry.close();
      fs.rmSync(small.scratch, { recursive: true, force: true });
    }
  });

  it('unknown, nested, and canceled hosts 404; suspended reefs 403', async () => {
    const unknown = await reefRequest(ctx.app, 'GET', `ghost.${BASE_DOMAIN}`, '/api/v1/instance/profile');
    expect(unknown.status).toBe(404);

    const nested = await reefRequest(ctx.app, 'GET', `a.coral.${BASE_DOMAIN}`, '/api/v1/instance/profile');
    expect(nested.status).toBe(404);

    const foreign = await reefRequest(ctx.app, 'GET', 'coral.evil.example', '/api/v1/instance/profile');
    expect(foreign.status).toBe(404);

    ctx.registry.setReefStatus('shell', 'suspended');
    const suspended = await reefRequest(ctx.app, 'GET', shell, '/api/v1/instance/profile');
    expect(suspended.status).toBe(403);
    const body = (await suspended.json()) as { error: { code: string } };
    expect(body.error.code).toBe('REEF_SUSPENDED');

    ctx.registry.setReefStatus('shell', 'canceled');
    const canceled = await reefRequest(ctx.app, 'GET', shell, '/api/v1/instance/profile');
    expect(canceled.status).toBe(404);

    // Non-API paths get the fish page, not JSON.
    const page = await reefRequest(ctx.app, 'GET', `ghost.${BASE_DOMAIN}`, '/');
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('This reef swam away');
  });

  it('the portal host answers health checks but serves no reef data', async () => {
    const health = await reefRequest(ctx.app, 'GET', APP_HOST, '/healthz');
    expect(health.status).toBe(200);
    expect(((await health.json()) as { ok: boolean }).ok).toBe(true);

    // Docker's healthcheck probes by localhost with no reef hostname.
    const anonymous = await reefRequest(ctx.app, 'GET', 'localhost', '/healthz');
    expect(anonymous.status).toBe(200);

    const api = await reefRequest(ctx.app, 'GET', APP_HOST, '/api/v1/instance/profile');
    expect(api.status).toBe(404);
  });

  it("snapshot browsing is reef-scoped: a keeper never sees another reef's snapshots or restores to them", async () => {
    fs.writeFileSync(
      path.join(ctx.scratch, 'snapshots.json'),
      JSON.stringify([
        { id: 'aaaa1111', time: '2026-08-22T07:17:01Z', reefs: ['coral', 'shell'] },
        { id: 'bbbb2222', time: '2026-08-21T07:17:01Z', reefs: ['shell'] },
      ]),
    );
    const keeper = await reefSignup(ctx.app, `coral.${BASE_DOMAIN}`, 'keeper');
    const listed = await reefRequest(ctx.app, 'GET', `coral.${BASE_DOMAIN}`, '/api/v1/cloud/snapshots', undefined, keeper);
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { snapshots: { id: string }[] };
    expect(body.snapshots.map((s) => s.id)).toEqual(['aaaa1111']); // never bbbb2222

    // Coral's keeper cannot restore to a snapshot that only holds shell.
    const cross = await reefRequest(
      ctx.app,
      'POST',
      `coral.${BASE_DOMAIN}`,
      '/api/v1/cloud/snapshots/restore',
      { snapshotId: 'bbbb2222' },
      keeper,
    );
    expect(cross.status).toBe(404);
  });

  it('the snapshot routes do not exist on a single-tenant reef', async () => {
    const { makeTestApp, signup, jsonRequest } = await import('./helpers.js');
    const single = makeTestApp();
    const cookie = await signup(single.app, 'reefkeeper');
    const response = await jsonRequest(single.app, 'GET', '/api/v1/cloud/snapshots', undefined, cookie);
    expect(response.status).toBe(404);
  });

  it('the registry refuses invalid and reserved slugs', () => {
    expect(() => ctx.registry.createReef('UPPER')).toThrow();
    expect(() => ctx.registry.createReef('has.dot')).toThrow();
    expect(() => ctx.registry.createReef('-edge')).toThrow();
    expect(() => ctx.registry.createReef('app')).toThrow();
    expect(() => ctx.registry.createReef('www')).toThrow();
    expect(() => ctx.registry.createReef('coral')).toThrow(); // duplicate
  });
});
