import { describe, expect, it } from 'vitest';
import type { AccessTokenDto, CreateAccessTokenResponse, MemoDto } from '@nemomemo/shared';
import { ACCESS_TOKEN_PREFIX } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

type App = Parameters<typeof jsonRequest>[0];
type Db = ReturnType<typeof makeTestApp>['db'];

const now = () => Math.floor(Date.now() / 1000);

/** Mint a token through the API and hand back its plaintext. */
async function mint(
  app: App,
  cookie: string,
  body: Record<string, unknown> = { name: 'cli' },
): Promise<CreateAccessTokenResponse> {
  const response = await jsonRequest(app, 'POST', '/api/v1/tokens', body, cookie);
  if (response.status !== 201) throw new Error(`mint failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as CreateAccessTokenResponse;
}

/** A request carrying a bearer token instead of a session cookie. */
async function bearer(
  app: App,
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<Response> {
  return app.request(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('access tokens — minting and managing', () => {
  it('mints a token, shows the plaintext once, and lists it without the secret', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { token, plaintext } = await mint(app, cookie, { name: 'my shortcut', scope: 'FULL' });
    expect(plaintext.startsWith(ACCESS_TOKEN_PREFIX)).toBe(true);
    expect(plaintext.length).toBeGreaterThan(30);
    expect(token.name).toBe('my shortcut');
    expect(token.scope).toBe('FULL');
    expect(token.lastUsedTs).toBeNull();

    const list = await jsonRequest(app, 'GET', '/api/v1/tokens', undefined, cookie);
    expect(list.status).toBe(200);
    const { tokens } = (await list.json()) as { tokens: AccessTokenDto[] };
    expect(tokens).toHaveLength(1);
    expect(JSON.stringify(tokens)).not.toContain(plaintext);
  });

  it('stores only the hash, never the plaintext', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { plaintext } = await mint(app, cookie);
    const rows = db.$client.prepare('SELECT token_hash FROM access_token').all() as { token_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toBe(plaintext);
    expect(rows[0]!.token_hash).toHaveLength(64);
  });

  it('revokes a token, and the token stops working immediately', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { token, plaintext } = await mint(app, cookie);
    expect((await bearer(app, 'GET', '/api/v1/auth/me', plaintext)).status).toBe(200);
    const revoked = await jsonRequest(app, 'DELETE', `/api/v1/tokens/${token.id}`, undefined, cookie);
    expect(revoked.status).toBe(200);
    expect((await bearer(app, 'GET', '/api/v1/auth/me', plaintext)).status).toBe(401);
  });

  it("cannot revoke another member's token", async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    const dory = await signup(app, 'dory');
    const { token } = await mint(app, dory);
    const response = await jsonRequest(app, 'DELETE', `/api/v1/tokens/${token.id}`, undefined, marlin);
    expect(response.status).toBe(404);
  });

  it('caps how many tokens one member can hold', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    for (let i = 0; i < 20; i++) await mint(app, cookie, { name: `token ${i}` });
    const response = await jsonRequest(app, 'POST', '/api/v1/tokens', { name: 'one too many' }, cookie);
    expect(response.status).toBe(400);
  });

  it('needs a signed-in member — anonymous cannot mint', async () => {
    const { app } = makeTestApp();
    expect((await jsonRequest(app, 'POST', '/api/v1/tokens', { name: 'nope' })).status).toBe(401);
  });
});

describe('access tokens — bearer resolution', () => {
  it('resolves the member behind a valid token', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { plaintext } = await mint(app, cookie);
    const me = await bearer(app, 'GET', '/api/v1/auth/me', plaintext);
    expect(me.status).toBe(200);
    const { user } = (await me.json()) as { user: { username: string } | null };
    expect(user?.username).toBe('marlin');
  });

  it('treats unknown, malformed, and expired tokens as anonymous', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { token, plaintext } = await mint(app, cookie);
    db.$client.prepare('UPDATE access_token SET expires_ts = ? WHERE id = ?').run(now() - 10, token.id);
    for (const candidate of [plaintext, 'nm_nonsense', 'not-even-a-token']) {
      expect((await bearer(app, 'GET', '/api/v1/auth/me', candidate)).status, candidate).toBe(401);
    }
  });

  it("ignores an archived member's token", async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { plaintext } = await mint(app, cookie);
    db.$client.prepare("UPDATE user SET row_status = 'ARCHIVED' WHERE username = 'marlin'").run();
    expect((await bearer(app, 'GET', '/api/v1/auth/me', plaintext)).status).toBe(401);
  });

  it('records last use, so a stale token is visible in Settings', async () => {
    const { app, db } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { token, plaintext } = await mint(app, cookie);
    await bearer(app, 'GET', '/api/v1/auth/me', plaintext);
    const row = db.$client
      .prepare('SELECT last_used_ts FROM access_token WHERE id = ?')
      .get(token.id) as { last_used_ts: number | null };
    expect(row.last_used_ts).not.toBeNull();
  });

  it('lets a session cookie win over a bearer header', async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    const dory = await signup(app, 'dory');
    const { plaintext } = await mint(app, dory);
    const response = await app.request('/api/v1/auth/me', {
      headers: { cookie: marlin, authorization: `Bearer ${plaintext}` },
    });
    const { user } = (await response.json()) as { user: { username: string } };
    expect(user.username).toBe('marlin');
  });
});

describe('access tokens — a token is weaker than a session', () => {
  it('cannot mint, list, or revoke tokens (no privilege escalation)', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { token, plaintext } = await mint(app, cookie);
    expect((await bearer(app, 'GET', '/api/v1/tokens', plaintext)).status).toBe(403);
    expect((await bearer(app, 'POST', '/api/v1/tokens', plaintext, { name: 'child' })).status).toBe(403);
    expect((await bearer(app, 'DELETE', `/api/v1/tokens/${token.id}`, plaintext)).status).toBe(403);
  });

  it('cannot change the account behind it', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const { plaintext } = await mint(app, cookie);
    const response = await bearer(app, 'PATCH', '/api/v1/users/-/account', plaintext, {
      password: 'hijacked-password',
    });
    expect(response.status).toBe(403);
  });

  it('cannot act as an admin', async () => {
    const { app } = makeTestApp();
    const admin = await signup(app, 'reefkeeper');
    const { plaintext } = await mint(app, admin);
    expect((await bearer(app, 'GET', '/api/v1/users', plaintext)).status).toBe(403);
  });
});

describe('access tokens — scopes', () => {
  it('lets a FULL token read and write memos', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const existing = await createMemo(app, cookie, { content: 'written in a browser' });
    const { plaintext } = await mint(app, cookie, { name: 'cli', scope: 'FULL' });

    const created = await bearer(app, 'POST', '/api/v1/memos', plaintext, { content: 'from a script #cli' });
    expect(created.status).toBe(201);
    expect((await bearer(app, 'GET', '/api/v1/memos?scope=home', plaintext)).status).toBe(200);
    expect((await bearer(app, 'GET', `/api/v1/memos/${existing.uid}`, plaintext)).status).toBe(200);
    const patched = await bearer(app, 'PATCH', `/api/v1/memos/${existing.uid}`, plaintext, {
      content: 'edited by a script',
    });
    expect(patched.status).toBe(200);
  });

  it('lets a CREATE_ONLY token post memos and nothing else', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const existing = await createMemo(app, cookie, { content: 'private words' });
    const { plaintext } = await mint(app, cookie, { name: 'capture', scope: 'CREATE_ONLY' });

    const created = await bearer(app, 'POST', '/api/v1/memos', plaintext, { content: 'captured on the go' });
    expect(created.status).toBe(201);
    const { memo } = (await created.json()) as { memo: MemoDto };
    expect(memo.content).toBe('captured on the go');

    // Everything else is refused — including reading the reef back.
    expect((await bearer(app, 'GET', '/api/v1/memos?scope=home', plaintext)).status).toBe(403);
    expect((await bearer(app, 'GET', `/api/v1/memos/${existing.uid}`, plaintext)).status).toBe(403);
    expect(
      (await bearer(app, 'PATCH', `/api/v1/memos/${existing.uid}`, plaintext, { content: 'nope' })).status,
    ).toBe(403);
    expect((await bearer(app, 'DELETE', `/api/v1/memos/${existing.uid}`, plaintext)).status).toBe(403);
    expect((await bearer(app, 'POST', '/api/v1/memos/bulk', plaintext, {
      uids: [existing.uid],
      action: 'archive',
    })).status).toBe(403);
  });

  it('leaves anonymous and session requests untouched by scope rules', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await createMemo(app, cookie, { content: 'still works', visibility: 'PUBLIC' });
    expect((await jsonRequest(app, 'GET', '/api/v1/memos?scope=home', undefined, cookie)).status).toBe(200);
    expect((await jsonRequest(app, 'GET', '/api/v1/memos?scope=explore')).status).toBe(200);
  });
});
