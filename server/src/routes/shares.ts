import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { memoShares, memos } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { nowSeconds } from '../lib/time.js';
import { requireViewer, type AppEnv } from '../middleware/auth.js';
import { buildMemoDtos } from '../services/memo-service.js';

export function shareRoutes(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /** Public: resolve a share token to its memo (attachments + reactions only scope). */
  app.get('/:token', (c) => {
    const share = db
      .select()
      .from(memoShares)
      .where(eq(memoShares.uid, c.req.param('token')))
      .get();
    const now = nowSeconds();
    if (!share || (share.expiresTs != null && share.expiresTs <= now)) {
      throw apiError('NOT_FOUND', 'This link is invalid or has expired');
    }
    const memo = db.select().from(memos).where(eq(memos.id, share.memoId)).get();
    if (!memo || (memo.forgetAt != null && memo.forgetAt <= now)) {
      throw apiError('NOT_FOUND', 'This memo swam away');
    }
    const dto = buildMemoDtos(db, [memo], c.get('viewer'))[0]!;
    // Share scope: strip the relation graph and comments; keep memo + attachments + reactions.
    return c.json({
      memo: { ...dto, referencing: [], referencedBy: [], commentCount: 0, parentUid: null },
    });
  });

  app.delete('/:token', (c) => {
    const viewer = requireViewer(c);
    const share = db
      .select()
      .from(memoShares)
      .where(eq(memoShares.uid, c.req.param('token')))
      .get();
    if (!share) throw apiError('NOT_FOUND', 'Share link not found');
    if (share.creatorId !== viewer.id && viewer.role !== 'ADMIN') {
      throw apiError('FORBIDDEN', 'Only the author can revoke this link');
    }
    db.delete(memoShares).where(eq(memoShares.id, share.id)).run();
    return c.json({ ok: true });
  });

  return app;
}
