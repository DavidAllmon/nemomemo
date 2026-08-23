import type { AttachmentDto } from '@nemomemo/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { attachments, memos } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { requireViewer, type AppEnv } from '../middleware/auth.js';
import { newUid } from '../services/memo-service.js';

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[\x00-\x1f\x7f]/g, "").replace(/^[.\s]+|[.\s]+$/g, "");
  return cleaned || 'file';
}

function toDto(db: Db, row: typeof attachments.$inferSelect): AttachmentDto {
  let memoUid: string | null = null;
  if (row.memoId != null) {
    memoUid = db.select().from(memos).where(eq(memos.id, row.memoId)).get()?.uid ?? null;
  }
  return {
    uid: row.uid,
    filename: row.filename,
    type: row.type,
    size: row.size,
    createdTs: row.createdTs,
    memoUid,
  };
}

export function attachmentRoutes(db: Db, config: Config): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post('/', async (c) => {
    const viewer = requireViewer(c);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw apiError('INVALID_ARGUMENT', 'Expected a `file` upload');
    if (file.size > MAX_UPLOAD_BYTES) throw apiError('INVALID_ARGUMENT', 'File is too large (max 32 MiB)');
    if (config.cloudLimits) {
      const used =
        db.select({ total: sql<number>`coalesce(sum(size), 0)` }).from(attachments).get()?.total ?? 0;
      if (used + file.size > config.cloudLimits.maxStorageBytes) {
        throw apiError('INVALID_ARGUMENT', "This reef's storage is full — tidy up some attachments first");
      }
    }

    const uid = newUid();
    const filename = sanitizeFilename(file.name);
    const relative = path.join('assets', `${Date.now()}_${uid}_${filename}`);
    const absolute = path.join(config.uploadsDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, Buffer.from(await file.arrayBuffer()));

    const created = db
      .insert(attachments)
      .values({
        uid,
        creatorId: viewer.id,
        filename,
        type: file.type || 'application/octet-stream',
        size: file.size,
        storagePath: relative,
      })
      .returning()
      .get();
    return c.json({ attachment: toDto(db, created) }, 201);
  });

  app.get('/', (c) => {
    const viewer = requireViewer(c);
    const kind = c.req.query('type');
    const unlinkedOnly = c.req.query('unlinked') === 'true';
    const tag = c.req.query('tag');
    let rows: (typeof attachments.$inferSelect)[];
    if (tag) {
      // Gallery filter: attachments whose memo carries the tag (implied
      // ancestors are in the payload, so filtering by a parent tag works).
      // Both time guards apply — a pending bottle's photo must not surface
      // through the gallery before the memo itself does.
      const now = Math.floor(Date.now() / 1000);
      const raw = db.$client
        .prepare(
          `SELECT attachment.* FROM attachment
            JOIN memo ON memo.id = attachment.memo_id
            WHERE attachment.creator_id = ?
              AND (memo.forget_at IS NULL OR memo.forget_at > ?)
              AND (memo.surface_at IS NULL OR memo.surface_at <= ?)
              AND EXISTS (SELECT 1 FROM json_each(memo.payload, '$.tags') WHERE json_each.value = ?)
            ORDER BY attachment.created_ts DESC, attachment.id DESC`,
        )
        .all(viewer.id, now, now, tag) as Record<string, unknown>[];
      rows = raw.map((row) => ({
        id: row.id as number,
        uid: row.uid as string,
        creatorId: row.creator_id as number,
        createdTs: row.created_ts as number,
        filename: row.filename as string,
        type: row.type as string,
        size: row.size as number,
        memoId: (row.memo_id as number | null) ?? null,
        storagePath: row.storage_path as string,
      }));
    } else {
      rows = db
        .select()
        .from(attachments)
        .where(
          unlinkedOnly
            ? and(eq(attachments.creatorId, viewer.id), isNull(attachments.memoId))
            : eq(attachments.creatorId, viewer.id),
        )
        .orderBy(desc(attachments.createdTs), desc(attachments.id))
        .all();
    }
    if (kind === 'media') rows = rows.filter((r) => r.type.startsWith('image/') || r.type.startsWith('video/'));
    if (kind === 'audio') rows = rows.filter((r) => r.type.startsWith('audio/'));
    if (kind === 'document')
      rows = rows.filter(
        (r) => !r.type.startsWith('image/') && !r.type.startsWith('video/') && !r.type.startsWith('audio/'),
      );
    return c.json({ attachments: rows.map((row) => toDto(db, row)) });
  });

  app.delete('/unused', (c) => {
    const viewer = requireViewer(c);
    const rows = db
      .select()
      .from(attachments)
      .where(and(eq(attachments.creatorId, viewer.id), isNull(attachments.memoId)))
      .all();
    for (const row of rows) {
      db.delete(attachments).where(eq(attachments.id, row.id)).run();
      removeStoredFile(config.uploadsDir, row.storagePath);
    }
    return c.json({ deleted: rows.length });
  });

  app.delete('/:uid', (c) => {
    const viewer = requireViewer(c);
    const row = db.select().from(attachments).where(eq(attachments.uid, c.req.param('uid'))).get();
    if (!row) throw apiError('NOT_FOUND', 'Attachment not found');
    if (row.creatorId !== viewer.id && viewer.role !== 'ADMIN') {
      throw apiError('FORBIDDEN', 'Only the uploader can delete this');
    }
    db.delete(attachments).where(eq(attachments.id, row.id)).run();
    removeStoredFile(config.uploadsDir, row.storagePath);
    return c.json({ ok: true });
  });

  return app;
}

export function removeStoredFile(uploadsDir: string, relative: string): void {
  const absolute = path.resolve(uploadsDir, relative);
  if (absolute.startsWith(path.resolve(uploadsDir))) {
    fs.rm(absolute, { force: true }, () => {});
    fs.rm(thumbnailPath(uploadsDir, relative), { force: true }, () => {});
  }
}

export function thumbnailPath(uploadsDir: string, relative: string): string {
  return path.join(uploadsDir, '.thumbs', relative.replaceAll(path.sep, '_') + '.webp');
}
