import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Db } from '../db/index.js';
import { userSessions, users, type UserRow } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { nowSeconds } from '../lib/time.js';

export const SESSION_COOKIE = 'nemomemo_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Refresh the sliding expiry at most once a day. */
const SESSION_TOUCH_INTERVAL_SECONDS = 24 * 60 * 60;

export interface AppEnv {
  Variables: {
    viewer: UserRow | null;
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: Db, c: Context, userId: number): void {
  const token = randomBytes(32).toString('base64url');
  const now = nowSeconds();
  db.insert(userSessions)
    .values({ userId, tokenHash: hashToken(token), expiresTs: now + SESSION_TTL_SECONDS })
    .run();
  // Opportunistic cleanup of this user's expired sessions.
  db.delete(userSessions)
    .where(and(eq(userSessions.userId, userId), lt(userSessions.expiresTs, now)))
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function destroySession(db: Db, c: Context): void {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    db.delete(userSessions).where(eq(userSessions.tokenHash, hashToken(token))).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Resolves the viewer from the session cookie; never rejects the request itself. */
export function viewerMiddleware(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('viewer', null);
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const now = nowSeconds();
      const session = db
        .select()
        .from(userSessions)
        .where(and(eq(userSessions.tokenHash, hashToken(token)), gt(userSessions.expiresTs, now)))
        .get();
      if (session) {
        const user = db.select().from(users).where(eq(users.id, session.userId)).get();
        if (user && user.rowStatus === 'NORMAL') {
          c.set('viewer', user);
          if (now - session.lastSeenTs > SESSION_TOUCH_INTERVAL_SECONDS) {
            db.update(userSessions)
              .set({ lastSeenTs: now, expiresTs: now + SESSION_TTL_SECONDS })
              .where(eq(userSessions.id, session.id))
              .run();
          }
        }
      }
    }
    await next();
  };
}

export function requireViewer(c: Context<AppEnv>): UserRow {
  const viewer = c.get('viewer');
  if (!viewer) throw apiError('UNAUTHENTICATED', 'Sign in to continue');
  return viewer;
}

export function requireAdmin(c: Context<AppEnv>): UserRow {
  const viewer = requireViewer(c);
  if (viewer.role !== 'ADMIN') throw apiError('FORBIDDEN', 'Admin access required');
  return viewer;
}
