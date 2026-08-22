import { inboxUpdateRequestSchema, type InboxDto } from '@nemomemo/shared';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { inboxes, memos, users } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { requireViewer, type AppEnv } from '../middleware/auth.js';
import { canGlimpseMemo } from '../services/acl.js';
import { snippet, userToDto } from '../services/memo-service.js';

export function inboxRoutes(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/', (c) => {
    const viewer = requireViewer(c);
    const status = c.req.query('status') === 'ARCHIVED' ? 'ARCHIVED' : 'UNREAD';
    const rows = db
      .select()
      .from(inboxes)
      .where(and(eq(inboxes.receiverId, viewer.id), eq(inboxes.status, status)))
      .orderBy(desc(inboxes.createdTs), desc(inboxes.id))
      .limit(100)
      .all();

    const senderIds = [...new Set(rows.map((row) => row.senderId))];
    const senders = senderIds.length
      ? new Map(db.select().from(users).where(inArray(users.id, senderIds)).all().map((u) => [u.id, u]))
      : new Map();
    const memoIds = [...new Set(rows.map((row) => row.memoId).filter((id): id is number => id != null))];
    const memoRows = memoIds.length
      ? new Map(db.select().from(memos).where(inArray(memos.id, memoIds)).all().map((m) => [m.id, m]))
      : new Map();

    const items: InboxDto[] = rows.map((row) => {
      const sender = senders.get(row.senderId);
      const memo = row.memoId != null ? memoRows.get(row.memoId) : undefined;
      // Visibility can change after the notification was created — re-check at
      // read time so a now-private/expired memo never leaks through its snippet.
      const readable = memo != null && canGlimpseMemo(memo, viewer);
      return {
        id: row.id,
        createdTs: row.createdTs,
        status: row.status,
        type: row.type,
        sender: sender ? userToDto(sender) : null,
        memoUid: readable ? memo.uid : null,
        memoSnippet: readable ? snippet(memo.content) : null,
      };
    });

    const unreadCount =
      db
        .select()
        .from(inboxes)
        .where(and(eq(inboxes.receiverId, viewer.id), eq(inboxes.status, 'UNREAD')))
        .all().length ?? 0;

    return c.json({ items, unreadCount });
  });

  app.patch('/:id', zValidator('json', inboxUpdateRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const id = Number(c.req.param('id'));
    const row = db.select().from(inboxes).where(eq(inboxes.id, id)).get();
    if (!row || row.receiverId !== viewer.id) throw apiError('NOT_FOUND', 'Notification not found');
    db.update(inboxes).set({ status: c.req.valid('json').status }).where(eq(inboxes.id, id)).run();
    return c.json({ ok: true });
  });

  app.delete('/:id', (c) => {
    const viewer = requireViewer(c);
    const id = Number(c.req.param('id'));
    const row = db.select().from(inboxes).where(eq(inboxes.id, id)).get();
    if (!row || row.receiverId !== viewer.id) throw apiError('NOT_FOUND', 'Notification not found');
    db.delete(inboxes).where(eq(inboxes.id, id)).run();
    return c.json({ ok: true });
  });

  app.post('/read-all', (c) => {
    const viewer = requireViewer(c);
    db.update(inboxes)
      .set({ status: 'ARCHIVED' })
      .where(and(eq(inboxes.receiverId, viewer.id), eq(inboxes.status, 'UNREAD')))
      .run();
    return c.json({ ok: true });
  });

  return app;
}
