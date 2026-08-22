import { describe, expect, it } from 'vitest';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

describe('auth', () => {
  it('first signup becomes admin and gets a session', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'marlin', email: 'marlin@test.reef',
      password: 'password123',
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { user: { role: string } };
    expect(json.user.role).toBe('ADMIN');
    expect(response.headers.get('set-cookie')).toContain('nemomemo_session=');
  });

  it('second signup is a regular user', async () => {
    const { app } = makeTestApp();
    await signup(app, 'marlin');
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'dory', email: 'dory@test.reef',
      password: 'password123',
    });
    const json = (await response.json()) as { user: { role: string } };
    expect(json.user.role).toBe('USER');
  });

  it('me returns the viewer with the cookie, 401 without', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const me = await jsonRequest(app, 'GET', '/api/v1/auth/me', undefined, cookie);
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { username: string } }).user.username).toBe('marlin');
    const anon = await jsonRequest(app, 'GET', '/api/v1/auth/me');
    expect(anon.status).toBe(401);
  });

  it('signin works and rejects bad passwords', async () => {
    const { app } = makeTestApp();
    await signup(app, 'marlin', 'correct-horse');
    const good = await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
      username: 'marlin',
      password: 'correct-horse',
    });
    expect(good.status).toBe(200);
    const bad = await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
      username: 'marlin',
      password: 'wrong',
    });
    expect(bad.status).toBe(401);
  });

  it('signout invalidates the session', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await jsonRequest(app, 'POST', '/api/v1/auth/signout', undefined, cookie);
    const me = await jsonRequest(app, 'GET', '/api/v1/auth/me', undefined, cookie);
    expect(me.status).toBe(401);
  });

  it('respects closed registration', async () => {
    const { app } = makeTestApp();
    const admin = await signup(app, 'marlin');
    await jsonRequest(app, 'PATCH', '/api/v1/instance/settings', { general: { allowRegistration: false } }, admin);
    const blocked = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'nemo', email: 'nemo@test.reef',
      password: 'password123',
    });
    expect(blocked.status).toBe(403);
  });

  it('mentionable lists active members for signed-in users only', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await signup(app, 'dory');
    const response = await jsonRequest(app, 'GET', '/api/v1/users/-/mentionable', undefined, cookie);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { users: { username: string; nickname: string }[] };
    expect(json.users.map((u) => u.username)).toEqual(['dory', 'marlin']);
    const anon = await jsonRequest(app, 'GET', '/api/v1/users/-/mentionable');
    expect(anon.status).toBe(401);
  });

  it('duplicate usernames are rejected', async () => {
    const { app } = makeTestApp();
    await signup(app, 'marlin');
    const dupe = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'marlin', email: 'marlin@test.reef',
      password: 'password123',
    });
    expect(dupe.status).toBe(409);
  });
});
