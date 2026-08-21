import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { attachments, memoShares, memos } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { nowSeconds } from '../lib/time.js';
import type { AppEnv } from '../middleware/auth.js';
import { checkMemoRead } from '../services/acl.js';
import { getParentMemo } from '../services/memo-service.js';
import { getInstanceGeneral } from '../services/settings.js';
import { thumbnailPath } from './attachments.js';

export function fileRoutes(db: Db, config: Config): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/attachments/:uid/:filename?', async (c) => {
    const row = db.select().from(attachments).where(eq(attachments.uid, c.req.param('uid'))).get();
    if (!row) throw apiError('NOT_FOUND', 'File not found');

    const viewer = c.get('viewer');

    // Access mirrors the owning memo; unlinked uploads are creator-only.
    if (row.memoId == null) {
      if (viewer?.id !== row.creatorId && viewer?.role !== 'ADMIN') {
        throw apiError('NOT_FOUND', 'File not found');
      }
    } else {
      const memo = db.select().from(memos).where(eq(memos.id, row.memoId)).get();
      if (!memo || (memo.forgetAt != null && memo.forgetAt <= nowSeconds())) {
        throw apiError('NOT_FOUND', 'File not found');
      }
      let sharedMemoId: number | undefined;
      const shareToken = c.req.query('share');
      if (shareToken) {
        const share = db.select().from(memoShares).where(eq(memoShares.uid, shareToken)).get();
        if (share && (share.expiresTs == null || share.expiresTs > nowSeconds())) {
          sharedMemoId = share.memoId;
        }
      }
      const denial = checkMemoRead(memo, getParentMemo(db, memo.id), viewer, {
        allowAnonymous: getInstanceGeneral(db).publicMode,
        sharedMemoId,
      });
      if (denial) throw apiError('NOT_FOUND', 'File not found');
    }

    const absolute = path.resolve(config.uploadsDir, row.storagePath);
    if (!absolute.startsWith(path.resolve(config.uploadsDir)) || !fs.existsSync(absolute)) {
      throw apiError('NOT_FOUND', 'File not found');
    }

    // Thumbnails for images (lazy webp cache).
    if (c.req.query('thumbnail') === '1' && row.type.startsWith('image/') && row.type !== 'image/svg+xml') {
      const thumb = thumbnailPath(config.uploadsDir, row.storagePath);
      try {
        if (!fs.existsSync(thumb)) {
          const { default: sharp } = await import('sharp');
          fs.mkdirSync(path.dirname(thumb), { recursive: true });
          await sharp(absolute).rotate().resize({ width: 512, withoutEnlargement: true }).webp().toFile(thumb);
        }
        return new Response(Readable.toWeb(fs.createReadStream(thumb)) as ReadableStream, {
          headers: {
            'content-type': 'image/webp',
            'cache-control': 'private, max-age=3600',
          },
        });
      } catch {
        // Fall through to the original file on any thumbnailing error.
      }
    }

    const stat = fs.statSync(absolute);
    const headers: Record<string, string> = {
      'content-type': row.type || 'application/octet-stream',
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    };

    const range = c.req.header('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          headers['content-range'] = `bytes ${start}-${end}/${stat.size}`;
          headers['content-length'] = String(end - start + 1);
          return new Response(
            Readable.toWeb(fs.createReadStream(absolute, { start, end })) as ReadableStream,
            { status: 206, headers },
          );
        }
        return new Response(null, {
          status: 416,
          headers: { 'content-range': `bytes */${stat.size}` },
        });
      }
    }

    headers['content-length'] = String(stat.size);
    return new Response(Readable.toWeb(fs.createReadStream(absolute)) as ReadableStream, { headers });
  });

  return app;
}
