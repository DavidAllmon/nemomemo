import { randomBytes } from 'node:crypto';
import {
  ACCESS_TOKEN_EXPIRY_PRESETS,
  ACCESS_TOKEN_LIMIT,
  ACCESS_TOKEN_PREFIX,
  createAccessTokenRequestSchema,
  type AccessTokenDto,
  type CreateAccessTokenResponse,
} from '@nemomemo/shared';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { accessTokens, type AccessTokenRow } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { nowSeconds } from '../lib/time.js';
import { hashToken, requireSessionViewer, type AppEnv } from '../middleware/auth.js';

function toDto(row: AccessTokenRow): AccessTokenDto {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    createdTs: row.createdTs,
    lastUsedTs: row.lastUsedTs,
    expiresTs: row.expiresTs,
  };
}

/**
 * Token management is session-only throughout (requireSessionViewer): a token
 * can never mint, list, or revoke tokens, so one leaked token stays exactly as
 * powerful as it was minted and can't spawn successors.
 */
export function tokenRoutes(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/', (c) => {
    const viewer = requireSessionViewer(c);
    const rows = db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.userId, viewer.id))
      .orderBy(asc(accessTokens.id))
      .all();
    return c.json({ tokens: rows.map(toDto) });
  });

  app.post('/', zValidator('json', createAccessTokenRequestSchema), (c) => {
    const viewer = requireSessionViewer(c);
    const body = c.req.valid('json');
    const existing = db.select().from(accessTokens).where(eq(accessTokens.userId, viewer.id)).all();
    if (existing.length >= ACCESS_TOKEN_LIMIT) {
      throw apiError(
        'INVALID_ARGUMENT',
        `That's ${ACCESS_TOKEN_LIMIT} tokens already — revoke one you no longer use first`,
      );
    }
    // The plaintext exists only in this response; we keep the hash.
    const plaintext = `${ACCESS_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const ttl = ACCESS_TOKEN_EXPIRY_PRESETS[body.expiresIn];
    const row = db
      .insert(accessTokens)
      .values({
        userId: viewer.id,
        name: body.name,
        tokenHash: hashToken(plaintext),
        scope: body.scope,
        expiresTs: ttl == null ? null : nowSeconds() + ttl,
      })
      .returning()
      .get();
    const response: CreateAccessTokenResponse = { token: toDto(row), plaintext };
    return c.json(response, 201);
  });

  app.delete('/:id', (c) => {
    const viewer = requireSessionViewer(c);
    const id = Number(c.req.param('id'));
    const row = db
      .select()
      .from(accessTokens)
      .where(and(eq(accessTokens.id, id), eq(accessTokens.userId, viewer.id)))
      .get();
    // Someone else's token is simply not there, as far as this member knows.
    if (!row) throw apiError('NOT_FOUND', 'That token has already swum away');
    db.delete(accessTokens).where(eq(accessTokens.id, row.id)).run();
    return c.json({ ok: true });
  });

  return app;
}
