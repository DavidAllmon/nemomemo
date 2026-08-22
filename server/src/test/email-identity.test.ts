import { describe, expect, it } from 'vitest';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

async function me(app: Parameters<typeof jsonRequest>[0], cookie: string) {
  const response = await jsonRequest(app, 'GET', '/api/v1/auth/me', undefined, cookie);
  expect(response.status).toBe(200);
  return ((await response.json()) as { user: { email?: string; emailVerified?: boolean } }).user;
}

describe('email is required identity', () => {
  it('rejects signup without an email', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'coral',
      password: 'password123',
    });
    expect(response.status).toBe(400);
  });

  it('normalizes and stores the email', async () => {
    const { app } = makeTestApp();
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'coral',
      password: 'password123',
      email: '  Coral@Reef.TEST ',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { email?: string } };
    expect(body.user.email).toBe('coral@reef.test');
  });

  it('rejects a duplicate email, case-insensitively', async () => {
    const { app } = makeTestApp();
    await signup(app, 'coral');
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', {
      username: 'imposter',
      password: 'password123',
      email: 'CORAL@test.reef', // helpers.signup uses <username>@test.reef
    });
    expect(response.status).toBe(409);
  });

  it('rejects changing account email to one already taken', async () => {
    const { app } = makeTestApp();
    await signup(app, 'coral');
    const marlin = await signup(app, 'marlin');
    const response = await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/account',
      { email: 'coral@test.reef' },
      marlin,
    );
    expect(response.status).toBe(409);
  });
});

describe('sign in with username or email', () => {
  it('accepts the email address in the username field', async () => {
    const { app } = makeTestApp();
    await signup(app, 'coral');
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
      username: 'coral@test.reef',
      password: 'password123',
    });
    expect(response.status).toBe(200);
  });

  it('still rejects a wrong password via email sign-in', async () => {
    const { app } = makeTestApp();
    await signup(app, 'coral');
    const response = await jsonRequest(app, 'POST', '/api/v1/auth/signin', {
      username: 'coral@test.reef',
      password: 'wrong-password',
    });
    expect(response.status).toBe(401);
  });
});

describe('email verification', () => {
  it('sends a verification email on signup and verifies via the token', async () => {
    const { app, sentMail } = makeTestApp();
    const cookie = await signup(app, 'coral');
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]!.to).toBe('coral@test.reef');
    // Signing up gets ONE email: a welcome that carries the verify link.
    expect(sentMail[0]!.subject).toMatch(/Welcome/);
    const token = /token=([A-Za-z0-9_-]+)/.exec(sentMail[0]!.text)?.[1];
    expect(token).toBeTruthy();

    expect((await me(app, cookie)).emailVerified).toBe(false);

    const verify = await jsonRequest(app, 'POST', '/api/v1/auth/verify', { token });
    expect(verify.status).toBe(200);
    expect((await me(app, cookie)).emailVerified).toBe(true);

    // Single use: a second redemption fails.
    const again = await jsonRequest(app, 'POST', '/api/v1/auth/verify', { token });
    expect(again.status).toBe(400);
  });

  it('can resend the verification email', async () => {
    const { app, sentMail } = makeTestApp();
    const cookie = await signup(app, 'coral');
    const resend = await jsonRequest(app, 'POST', '/api/v1/auth/verify/resend', {}, cookie);
    expect(resend.status).toBe(200);
    expect(sentMail).toHaveLength(2);
    // Resends are plain verification copy, not another welcome.
    expect(sentMail[1]!.subject).toMatch(/Verify/);
  });

  it('changing the email un-verifies and re-sends', async () => {
    const { app, sentMail } = makeTestApp();
    const cookie = await signup(app, 'coral');
    const token = /token=([A-Za-z0-9_-]+)/.exec(sentMail[0]!.text)![1];
    await jsonRequest(app, 'POST', '/api/v1/auth/verify', { token });

    const change = await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/account',
      { email: 'new@test.reef' },
      cookie,
    );
    expect(change.status).toBe(200);
    expect((await me(app, cookie)).emailVerified).toBe(false);
    // Verification goes to the NEW address; the old one gets a security notice.
    expect(sentMail.some((m) => m.to === 'new@test.reef' && /verify/i.test(m.subject))).toBe(true);
    expect(sentMail.some((m) => m.to === 'coral@test.reef' && /email/i.test(m.subject))).toBe(true);
  });
});

describe('graceful degradation without SMTP', () => {
  it('signup still works, nothing sends, and the profile says email is off', async () => {
    const { app, sentMail } = makeTestApp({}, { email: false });
    const cookie = await signup(app, 'coral');
    expect(sentMail).toHaveLength(0);
    expect(cookie).toContain('nemomemo_session');

    const profile = (await (await jsonRequest(app, 'GET', '/api/v1/instance/profile')).json()) as {
      emailEnabled: boolean;
    };
    expect(profile.emailEnabled).toBe(false);
  });

  it('the profile reports email enabled when a mailer exists', async () => {
    const { app } = makeTestApp();
    const profile = (await (await jsonRequest(app, 'GET', '/api/v1/instance/profile')).json()) as {
      emailEnabled: boolean;
    };
    expect(profile.emailEnabled).toBe(true);
  });
});
