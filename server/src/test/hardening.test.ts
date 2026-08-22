import { describe, expect, it } from 'vitest';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

async function uploadFile(
  app: Awaited<ReturnType<typeof makeTestApp>>['app'],
  cookie: string,
  name: string,
  type: string,
  contents: string,
): Promise<string> {
  const form = new FormData();
  form.append('file', new File([contents], name, { type }));
  const response = await app.request('/api/v1/attachments', {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  expect(response.status).toBe(201);
  const json = (await response.json()) as { attachment: { uid: string } };
  return json.attachment.uid;
}

describe('rate limiting', () => {
  it('limits signin attempts per IP and answers 429 with retry-after', async () => {
    const { app } = makeTestApp();
    await signup(app, 'keeper');
    // Invalid bodies count too (they must — the limiter guards the bcrypt work
    // behind validation) and keep this test fast.
    for (let i = 0; i < 10; i++) {
      const response = await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
        username: 'keeper',
        password: '',
      });
      expect(response.status).toBe(400);
    }
    const limited = await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
      username: 'keeper',
      password: 'password123',
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    const body = (await limited.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RESOURCE_EXHAUSTED');
  });

  it('tracks limits per client IP (cf-connecting-ip wins)', async () => {
    const { app } = makeTestApp();
    await signup(app, 'keeper');
    for (let i = 0; i < 10; i++) {
      await app.request('/api/v1/auth/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
        body: JSON.stringify({ username: 'keeper', password: '' }),
      });
    }
    const sameIp = await app.request('/api/v1/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify({ username: 'keeper', password: 'password123' }),
    });
    expect(sameIp.status).toBe(429);
    const otherIp = await app.request('/api/v1/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.9' },
      body: JSON.stringify({ username: 'keeper', password: 'password123' }),
    });
    expect(otherIp.status).toBe(200);
  });

  it('limits signup attempts per IP', async () => {
    const { app } = makeTestApp();
    // Invalid usernames are rejected fast but still count toward the window.
    for (let i = 0; i < 30; i++) {
      const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
        username: '!!bad!!',
        password: 'password123',
      });
      expect(response.status).toBe(400);
    }
    const limited = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'legit',
      password: 'password123',
    });
    expect(limited.status).toBe(429);
  });
});

describe('attachment serving headers (F1)', () => {
  it('serves svg with nosniff, a sandbox CSP, and attachment disposition', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'keeper');
    const uid = await uploadFile(
      app,
      cookie,
      'sneaky.svg',
      'image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const response = await app.request(`/file/attachments/${uid}/sneaky.svg`, {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('serves html as an attachment too', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'keeper');
    const uid = await uploadFile(app, cookie, 'page.html', 'text/html', '<script>alert(1)</script>');
    const response = await app.request(`/file/attachments/${uid}/page.html`, {
      headers: { cookie },
    });
    expect(response.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('keeps raster images inline so <img> embeds work untouched', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'keeper');
    const uid = await uploadFile(app, cookie, 'photo.png', 'image/png', 'not-really-a-png');
    const response = await app.request(`/file/attachments/${uid}/photo.png`, {
      headers: { cookie },
    });
    expect(response.headers.get('content-disposition')).toMatch(/^inline/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('secure session cookie (F4)', () => {
  it('marks the session cookie Secure behind https', async () => {
    const { app } = makeTestApp();
    const response = await app.request('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ username: 'keeper', password: 'password123' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/;\s*Secure/i);
  });

  it('leaves the cookie non-Secure on plain http so LAN self-hosts keep working', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'keeper',
      password: 'password123',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).not.toMatch(/;\s*Secure/i);
  });
});

describe('security headers middleware (F5)', () => {
  it('stamps default security headers on API responses', async () => {
    const { app } = makeTestApp();
    const response = await app.request('/healthz');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('does not clobber headers a route already set', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'keeper');
    const uid = await uploadFile(app, cookie, 'photo.png', 'image/png', 'x');
    const response = await app.request(`/file/attachments/${uid}/photo.png`, {
      headers: { cookie },
    });
    // file.ts sets its own cache-control; the middleware must not overwrite it.
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
  });
});

describe('signin does not reveal whether a username exists (F7)', () => {
  it('answers unknown-user and wrong-password identically', async () => {
    const { app } = makeTestApp();
    await signup(app, 'keeper');
    const unknown = await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
      username: 'nobody',
      password: 'password123',
    });
    const wrongPassword = await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
      username: 'keeper',
      password: 'wrong-password',
    });
    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(await unknown.text()).toBe(await wrongPassword.text());
  });
});

describe('password minimum length is 8 (F8)', () => {
  it('rejects a 7-character password on signup', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'keeper',
      password: 'seven77',
    });
    expect(response.status).toBe(400);
  });

  it('accepts an 8-character password', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'keeper',
      password: 'eight888',
    });
    expect(response.status).toBe(200);
  });

  it('rejects a short password on account update', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'keeper');
    const response = await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/account',
      { password: 'seven77' },
      cookie,
    );
    expect(response.status).toBe(400);
  });
});

describe('avatarUrl validation (F6)', () => {
  it('rejects non-image schemes', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'keeper');
    for (const avatarUrl of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://x/y.png']) {
      const response = await jsonRequest(app, 'PATCH', '/api/v1/users/-/account', { avatarUrl }, cookie);
      expect(response.status, avatarUrl).toBe(400);
    }
  });

  it('accepts data:image URIs, web URLs, and clearing', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'keeper');
    for (const avatarUrl of ['data:image/png;base64,iVBORw0KGgo=', 'https://example.com/fish.png', '']) {
      const response = await jsonRequest(app, 'PATCH', '/api/v1/users/-/account', { avatarUrl }, cookie);
      expect(response.status, avatarUrl || '(empty)').toBe(200);
    }
  });

  it('caps oversized data URIs', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'keeper');
    const huge = `data:image/png;base64,${'A'.repeat(2_000_001)}`;
    const response = await jsonRequest(app, 'PATCH', '/api/v1/users/-/account', { avatarUrl: huge }, cookie);
    expect(response.status).toBe(400);
  });
});
