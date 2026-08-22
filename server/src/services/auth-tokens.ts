import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { authTokens } from '../db/schema.js';
import { nowSeconds } from '../lib/time.js';

export type AuthTokenPurpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Mint a single-use token; only its sha256 touches the database. */
export function createAuthToken(
  db: Db,
  userId: number,
  purpose: AuthTokenPurpose,
  ttlSeconds: number,
): string {
  const token = randomBytes(32).toString('base64url');
  const now = nowSeconds();
  // A fresh token supersedes older unused ones of the same purpose.
  db.delete(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedTs)))
    .run();
  db.insert(authTokens)
    .values({ userId, purpose, tokenHash: hash(token), expiresTs: now + ttlSeconds })
    .run();
  // Opportunistic cleanup of anything long expired.
  db.delete(authTokens).where(lt(authTokens.expiresTs, now - 30 * 24 * 3600)).run();
  return token;
}

/** Redeem a token exactly once; returns the user id or null. */
export function consumeAuthToken(db: Db, rawToken: string, purpose: AuthTokenPurpose): number | null {
  if (!rawToken) return null;
  const row = db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hash(rawToken)), eq(authTokens.purpose, purpose)))
    .get();
  if (!row || row.usedTs != null || row.expiresTs <= nowSeconds()) return null;
  db.update(authTokens).set({ usedTs: nowSeconds() }).where(eq(authTokens.id, row.id)).run();
  return row.userId;
}
