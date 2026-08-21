import type { AttachmentDto } from '@nemomemo/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
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
    let rows = db
      .select()
      .from(attachments)
      .where(
        unlinkedOnly
          ? and(eq(attachments.creatorId, viewer.id), isNull(attachments.memoId))
          : eq(attachments.creatorId, viewer.id),
      )
      .orderBy(desc(attachments.createdTs), desc(attachments.id))
      .all();
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
