import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AccessTokenScope } from '@nemomemo/shared';
import type { Db } from '../db/index.js';
import { accessTokens, userSessions, users, type UserRow } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { nowSeconds } from '../lib/time.js';

export const SESSION_COOKIE = 'nemomemo_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Refresh the sliding expiry at most once a day. */
const SESSION_TOUCH_INTERVAL_SECONDS = 24 * 60 * 60;
/** Record a token's last use at most once an hour — it's a UI nicety, not an audit log. */
const TOKEN_TOUCH_INTERVAL_SECONDS = 60 * 60;

export interface AppEnv {
  Variables: {
    viewer: UserRow | null;
    /**
     * The scope of the access token this request arrived on, or null for
     * session-cookie and anonymous requests. Anything a token must never do
     * checks this (see requireSessionViewer).
     */
    tokenScope: AccessTokenScope | null;
  };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** True when the client reached us over https (directly or via a trusted proxy). */
function isSecureRequest(c: Context): boolean {
  const forwarded = c.req.header('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]!.trim() === 'https';
  return new URL(c.req.url).protocol === 'https:';
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
    // Secure only when actually on https: plain-http LAN self-hosts must keep working.
    secure: isSecureRequest(c),
  });
}

export function destroySession(db: Db, c: Context): void {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    db.delete(userSessions).where(eq(userSessions.tokenHash, hashToken(token))).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Pure session-token → active user lookup (also used by the cloud layer). */
export function resolveSessionViewer(
  db: Db,
  token: string,
): { user: UserRow; sessionId: number; lastSeenTs: number } | null {
  const now = nowSeconds();
  const session = db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.tokenHash, hashToken(token)), gt(userSessions.expiresTs, now)))
    .get();
  if (!session) return null;
  const user = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user || user.rowStatus !== 'NORMAL') return null;
  return { user, sessionId: session.id, lastSeenTs: session.lastSeenTs };
}

/**
 * Pure access-token → active user lookup. SHA-256 rather than bcrypt on
 * purpose: the token is 256 bits of randomness, so there is nothing to
 * brute-force, and an unauthenticated bcrypt path would be a DoS surface.
 */
export function resolveTokenViewer(
  db: Db,
  token: string,
): { user: UserRow; scope: AccessTokenScope; tokenId: number; lastUsedTs: number | null } | null {
  const row = db.select().from(accessTokens).where(eq(accessTokens.tokenHash, hashToken(token))).get();
  if (!row) return null;
  if (row.expiresTs != null && row.expiresTs <= nowSeconds()) return null;
  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user || user.rowStatus !== 'NORMAL') return null;
  return { user, scope: row.scope, tokenId: row.id, lastUsedTs: row.lastUsedTs };
}

/**
 * Resolves the viewer from the session cookie, falling back to a bearer access
 * token; never rejects the request itself. The cookie wins — a browser session
 * is never downgraded to a token's narrower powers.
 */
export function viewerMiddleware(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('viewer', null);
    c.set('tokenScope', null);
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const resolved = resolveSessionViewer(db, token);
      if (resolved) {
        c.set('viewer', resolved.user);
        const now = nowSeconds();
        if (now - resolved.lastSeenTs > SESSION_TOUCH_INTERVAL_SECONDS) {
          db.update(userSessions)
            .set({ lastSeenTs: now, expiresTs: now + SESSION_TTL_SECONDS })
            .where(eq(userSessions.id, resolved.sessionId))
            .run();
        }
      }
    }
    if (!c.get('viewer')) {
      const header = c.req.header('authorization');
      const bearer = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
      if (bearer) {
        const resolved = resolveTokenViewer(db, bearer);
        if (resolved) {
          c.set('viewer', resolved.user);
          c.set('tokenScope', resolved.scope);
          const now = nowSeconds();
          if (resolved.lastUsedTs == null || now - resolved.lastUsedTs > TOKEN_TOUCH_INTERVAL_SECONDS) {
            db.update(accessTokens)
              .set({ lastUsedTs: now })
              .where(eq(accessTokens.id, resolved.tokenId))
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

/**
 * A viewer who arrived on a real session, not an access token. Guards
 * everything a token must never reach — token management itself, account
 * changes, sign-out — so a leaked token can never become account takeover.
 */
export function requireSessionViewer(c: Context<AppEnv>): UserRow {
  const viewer = requireViewer(c);
  if (c.get('tokenScope') != null) {
    throw apiError('FORBIDDEN', 'Access tokens can\'t do this — sign in to your reef for that');
  }
  return viewer;
}

/**
 * The only things a CREATE_ONLY token may do: post a new memo, and upload an
 * attachment to put in one. Everything else on the API — reading the reef
 * included — is refused, so a capture script on a phone or a bot can never be
 * turned around and used to exfiltrate somebody's memos.
 *
 * Mounted once on the API router, so a new route is confined by default
 * rather than by remembering to guard it.
 */
export function createOnlyScopeGate(): MiddlewareHandler<AppEnv> {
  const allowed = [
    { method: 'POST', path: '/api/v1/memos' },
    { method: 'POST', path: '/api/v1/attachments' },
  ];
  return async (c, next) => {
    if (c.get('tokenScope') === 'CREATE_ONLY') {
      const path = new URL(c.req.url).pathname.replace(/\/$/, '');
      const ok = allowed.some((rule) => rule.method === c.req.method && rule.path === path);
      if (!ok) {
        throw apiError('FORBIDDEN', 'This token can only write new memos — mint a full one for more');
      }
    }
    await next();
  };
}

export function requireAdmin(c: Context<AppEnv>): UserRow {
  const viewer = requireSessionViewer(c);
  if (viewer.role !== 'ADMIN') throw apiError('FORBIDDEN', 'Admin access required');
  return viewer;
}
