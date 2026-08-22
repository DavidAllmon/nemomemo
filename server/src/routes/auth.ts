import { signinRequestSchema, signupRequestSchema, verifyEmailRequestSchema } from '@nemomemo/shared';
import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import {
  createSession,
  destroySession,
  requireViewer,
  type AppEnv,
} from '../middleware/auth.js';
import { makeRateLimiter } from '../middleware/rate-limit.js';
import { consumeAuthToken, createAuthToken } from '../services/auth-tokens.js';
import { trySend, verifyEmailMessage, type Mailer } from '../services/email.js';
import { userToDto } from '../services/memo-service.js';
import { getInstanceGeneral } from '../services/settings.js';
import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { nowSeconds } from '../lib/time.js';

const VERIFY_TTL_SECONDS = 7 * 24 * 3600;

/** Case-insensitive lookup of a user by email; null unless exactly one match. */
export function findUserByEmail(db: Db, email: string): typeof users.$inferSelect | null {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  const matches = db.select().from(users).where(eq(users.email, needle)).all();
  return matches.length === 1 ? matches[0]! : null;
}

/** The public origin of this request (proxy-aware) for building email links. */
export function requestOrigin(c: Context): string {
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() ?? new URL(c.req.url).protocol.replace(':', '');
  const host = c.req.header('host') ?? new URL(c.req.url).host;
  return `${proto}://${host}`;
}

/** Mint a verify token and (maybe) send the email. No-op without a mailer. */
export function sendVerificationEmail(
  db: Db,
  mailer: Mailer | null,
  c: Context,
  user: typeof users.$inferSelect,
): void {
  if (!mailer || !user.email) return;
  const token = createAuthToken(db, user.id, 'EMAIL_VERIFY', VERIFY_TTL_SECONDS);
  const link = `${requestOrigin(c)}/auth/verify?token=${token}`;
  const instanceName = getInstanceGeneral(db).name;
  trySend(mailer, { to: user.email, ...verifyEmailMessage(instanceName, user.username, link) });
}

// A real bcrypt hash of an unguessable value, computed once per process: signin
// compares against it when the username doesn't exist, so unknown-user and
// wrong-password take the same time and usernames can't be enumerated by clock.
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);

export function authRoutes(db: Db, config: Config, mailer: Mailer | null): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  // Limiters sit BEFORE validation so garbage requests count too; bcrypt runs on
  // the event loop, so unlimited guessing doubles as a CPU DoS (audit F3).
  const signupLimiter = makeRateLimiter({ scope: 'signup', windowMs: 60 * 60_000, max: 30 });
  const signinLimiter = makeRateLimiter({ scope: 'signin', windowMs: 60_000, max: 10 });

  app.post('/signup', signupLimiter, zValidator('json', signupRequestSchema), async (c) => {
    const body = c.req.valid('json');
    // Hash BEFORE any checks: everything after this line is synchronous
    // SQLite, so two concurrent signups can't both observe an empty user
    // table and both claim the first-user admin role.
    const passwordHash = await bcrypt.hash(body.password, 12);

    const userCount = db.select({ count: sql<number>`count(*)` }).from(users).get()?.count ?? 0;
    const isFirstUser = userCount === 0;

    if (!isFirstUser && !getInstanceGeneral(db).allowRegistration) {
      throw apiError('FORBIDDEN', 'Sign-ups are closed on this reef');
    }
    if (!isFirstUser && config.cloudLimits && userCount >= config.cloudLimits.maxMembers) {
      throw apiError('FORBIDDEN', 'This reef is at capacity — contact your reefkeeper');
    }
    const existing = db.select().from(users).where(eq(users.username, body.username)).get();
    if (existing) throw apiError('ALREADY_EXISTS', 'That username is already taken');
    if (db.select().from(users).where(eq(users.email, body.email)).get()) {
      throw apiError('ALREADY_EXISTS', 'That email already belongs to a reef account');
    }

    const created = db
      .insert(users)
      .values({
        username: body.username,
        nickname: body.nickname ?? body.username,
        email: body.email,
        passwordHash,
        role: isFirstUser ? 'ADMIN' : 'USER',
      })
      .returning()
      .get();

    sendVerificationEmail(db, mailer, c, created);
    createSession(db, c, created.id);
    return c.json({ user: userToDto(created, { includeEmail: true }) });
  });

  app.post('/signin', signinLimiter, zValidator('json', signinRequestSchema), async (c) => {
    const body = c.req.valid('json');
    // The one field accepts a username or an email address.
    const user =
      db.select().from(users).where(eq(users.username, body.username)).get() ??
      (body.username.includes('@') ? findUserByEmail(db, body.username) : null) ??
      undefined;
    const passwordOk = await bcrypt.compare(body.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !passwordOk) {
      throw apiError('UNAUTHENTICATED', 'Incorrect username or password');
    }
    if (user.rowStatus === 'ARCHIVED') {
      throw apiError('FORBIDDEN', 'This account has been archived');
    }
    createSession(db, c, user.id);
    return c.json({ user: userToDto(user, { includeEmail: true }) });
  });

  app.post('/signout', (c) => {
    destroySession(db, c);
    return c.json({ ok: true });
  });

  app.get('/me', (c) => {
    const viewer = requireViewer(c);
    return c.json({ user: userToDto(viewer, { includeEmail: true }) });
  });

  app.post('/verify', zValidator('json', verifyEmailRequestSchema), (c) => {
    const userId = consumeAuthToken(db, c.req.valid('json').token, 'EMAIL_VERIFY');
    if (userId == null) {
      throw apiError('INVALID_ARGUMENT', 'This verification link swam away — request a fresh one');
    }
    db.update(users).set({ emailVerifiedTs: nowSeconds() }).where(eq(users.id, userId)).run();
    return c.json({ ok: true });
  });

  const resendLimiter = makeRateLimiter({ scope: 'verify-resend', windowMs: 60 * 60_000, max: 5 });
  app.post('/verify/resend', resendLimiter, (c) => {
    const viewer = requireViewer(c);
    if (!mailer) throw apiError('INVALID_ARGUMENT', 'This reef has no email set up');
    if (!viewer.email) throw apiError('INVALID_ARGUMENT', 'Add an email to your account first');
    if (viewer.emailVerifiedTs != null) return c.json({ ok: true });
    sendVerificationEmail(db, mailer, c, viewer);
    return c.json({ ok: true });
  });

  return app;
}
