import { signinRequestSchema, signupRequestSchema } from '@nemomemo/shared';
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
import { userToDto } from '../services/memo-service.js';
import { getInstanceGeneral } from '../services/settings.js';
import { randomBytes } from 'node:crypto';

// A real bcrypt hash of an unguessable value, computed once per process: signin
// compares against it when the username doesn't exist, so unknown-user and
// wrong-password take the same time and usernames can't be enumerated by clock.
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);

export function authRoutes(db: Db, config: Config): Hono<AppEnv> {
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

    const created = db
      .insert(users)
      .values({
        username: body.username,
        nickname: body.nickname ?? body.username,
        passwordHash,
        role: isFirstUser ? 'ADMIN' : 'USER',
      })
      .returning()
      .get();

    createSession(db, c, created.id);
    return c.json({ user: userToDto(created, { includeEmail: true }) });
  });

  app.post('/signin', signinLimiter, zValidator('json', signinRequestSchema), async (c) => {
    const body = c.req.valid('json');
    const user = db.select().from(users).where(eq(users.username, body.username)).get();
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

  return app;
}
