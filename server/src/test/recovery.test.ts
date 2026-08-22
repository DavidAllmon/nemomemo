import { describe, expect, it } from 'vitest';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)?.[1];

describe('password reset (forgot flow)', () => {
  it('emails a reset link and the new password works; old sessions die', async () => {
    const { app, sentMail } = makeTestApp();
    const oldCookie = await signup(app, 'coral');
    sentMail.length = 0;

    const forgot = await jsonRequest(app, 'POST', '/api/v1/auth/forgot', { email: 'coral@test.reef' });
    expect(forgot.status).toBe(200);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]!.subject).toMatch(/password/i);
    const token = tokenFrom(sentMail[0]!.text)!;

    const reset = await jsonRequest(app, 'POST', '/api/v1/auth/reset', {
      token,
      password: 'brand-new-pass',
    });
    expect(reset.status).toBe(200);

    // Old session revoked, old password dead, new password works.
    const me = await jsonRequest(app, 'GET', '/api/v1/auth/me', undefined, oldCookie);
    expect(me.status).toBe(401);
    const oldPw = await jsonRequest(app, 'POST', '/api/v1/auth/signin', { username: 'coral', password: 'password123' });
    expect(oldPw.status).toBe(401);
    const newPw = await jsonRequest(app, 'POST', '/api/v1/auth/signin', { username: 'coral', password: 'brand-new-pass' });
    expect(newPw.status).toBe(200);

    // Token is single-use.
    const again = await jsonRequest(app, 'POST', '/api/v1/auth/reset', { token, password: 'another-pass' });
    expect(again.status).toBe(400);
  });

  it('never reveals whether an email exists', async () => {
    const { app, sentMail } = makeTestApp();
    await signup(app, 'coral');
    sentMail.length = 0;
    const unknown = await jsonRequest(app, 'POST', '/api/v1/auth/forgot', { email: 'nobody@test.reef' });
    expect(unknown.status).toBe(200);
    expect(sentMail).toHaveLength(0);
  });

  it('completing a reset marks the email verified (inbox proven)', async () => {
    const { app, sentMail } = makeTestApp();
    await signup(app, 'coral');
    sentMail.length = 0;
    await jsonRequest(app, 'POST', '/api/v1/auth/forgot', { email: 'coral@test.reef' });
    const token = tokenFrom(sentMail[0]!.text)!;
    await jsonRequest(app, 'POST', '/api/v1/auth/reset', { token, password: 'brand-new-pass' });
    const signin = await jsonRequest(app, 'POST', '/api/v1/auth/signin', { username: 'coral', password: 'brand-new-pass' });
    const body = (await signin.json()) as { user: { emailVerified?: boolean } };
    expect(body.user.emailVerified).toBe(true);
  });
});

describe('admin invites', () => {
  it('admin creates a member by email; they set their password via the link', async () => {
    const { app, sentMail } = makeTestApp();
    const admin = await signup(app, 'reefkeeper');
    sentMail.length = 0;

    const invite = await jsonRequest(
      app,
      'POST',
      '/api/v1/users',
      { username: 'newfish', email: 'newfish@test.reef' },
      admin,
    );
    expect(invite.status).toBe(201);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]!.to).toBe('newfish@test.reef');
    expect(sentMail[0]!.subject).toMatch(/invited/i);
    const token = tokenFrom(sentMail[0]!.text)!;

    // Can't sign in before setting a password.
    const early = await jsonRequest(app, 'POST', '/api/v1/auth/signin', { username: 'newfish', password: 'password123' });
    expect(early.status).toBe(401);

    const set = await jsonRequest(app, 'POST', '/api/v1/auth/reset', { token, password: 'my-own-pass' });
    expect(set.status).toBe(200);
    const signin = await jsonRequest(app, 'POST', '/api/v1/auth/signin', { username: 'newfish', password: 'my-own-pass' });
    expect(signin.status).toBe(200);
    const body = (await signin.json()) as { user: { emailVerified?: boolean } };
    expect(body.user.emailVerified).toBe(true);
  });

  it('without a mailer the admin must set a password directly', async () => {
    const { app } = makeTestApp({}, { email: false });
    const admin = await signup(app, 'reefkeeper');
    const noPassword = await jsonRequest(app, 'POST', '/api/v1/users', { username: 'newfish', email: 'newfish@test.reef' }, admin);
    expect(noPassword.status).toBe(400);
    const withPassword = await jsonRequest(
      app,
      'POST',
      '/api/v1/users',
      { username: 'newfish', email: 'newfish@test.reef', password: 'password123' },
      admin,
    );
    expect(withPassword.status).toBe(201);
  });
});

describe('security notification emails', () => {
  it('changing your password sends a heads-up', async () => {
    const { app, sentMail } = makeTestApp();
    const cookie = await signup(app, 'coral');
    sentMail.length = 0;
    const change = await jsonRequest(app, 'PATCH', '/api/v1/users/-/account', { password: 'brand-new-pass' }, cookie);
    expect(change.status).toBe(200);
    expect(sentMail.some((m) => m.to === 'coral@test.reef' && /password/i.test(m.subject))).toBe(true);
  });

  it('changing your email notifies the OLD address', async () => {
    const { app, sentMail } = makeTestApp();
    const cookie = await signup(app, 'coral');
    sentMail.length = 0;
    await jsonRequest(app, 'PATCH', '/api/v1/users/-/account', { email: 'new@test.reef' }, cookie);
    expect(sentMail.some((m) => m.to === 'coral@test.reef' && /email/i.test(m.subject))).toBe(true);
  });
});
