import { signinRequestSchema, signupRequestSchema } from '@nemomemo/shared';
import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import {
  createSession,
  destroySession,
  requireViewer,
  type AppEnv,
} from '../middleware/auth.js';
import { userToDto } from '../services/memo-service.js';
import { getInstanceGeneral } from '../services/settings.js';

export function authRoutes(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post('/signup', zValidator('json', signupRequestSchema), async (c) => {
    const body = c.req.valid('json');
    const userCount = db.select({ count: sql<number>`count(*)` }).from(users).get()?.count ?? 0;
    const isFirstUser = userCount === 0;

    if (!isFirstUser && !getInstanceGeneral(db).allowRegistration) {
      throw apiError('FORBIDDEN', 'Sign-ups are closed on this reef');
    }
    const existing = db.select().from(users).where(eq(users.username, body.username)).get();
    if (existing) throw apiError('ALREADY_EXISTS', 'That username is already taken');

    const passwordHash = await bcrypt.hash(body.password, 12);
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

  app.post('/signin', zValidator('json', signinRequestSchema), async (c) => {
    const body = c.req.valid('json');
    const user = db.select().from(users).where(eq(users.username, body.username)).get();
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
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
