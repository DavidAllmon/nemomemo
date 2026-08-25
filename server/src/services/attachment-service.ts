import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { attachments, type AttachmentRow } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { newUid } from './memo-service.js';
import type { OcrQueue } from './ocr.js';

export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

/** Strip any path and control characters — a stored name can't traverse. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[\x00-\x1f\x7f]/g, '').replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned || 'file';
}

export interface StoreAttachmentInput {
  creatorId: number;
  filename: string;
  type: string;
  bytes: Buffer;
}

export interface StoreAttachmentQueues {
  ocr?: OcrQueue | null;
  transcribe?: OcrQueue | null;
}

/**
 * The one way a file becomes an attachment: size and quota checks, the disk
 * write, the row, and the OCR/transcription hand-off. The browser upload route
 * and the Telegram bot both come through here, so a photo captured on a phone
 * is indexed exactly like one dragged into the editor.
 */
export function storeAttachment(
  db: Db,
  config: Config,
  input: StoreAttachmentInput,
  queues: StoreAttachmentQueues = {},
): AttachmentRow {
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw apiError('INVALID_ARGUMENT', 'File is too large (max 32 MiB)');
  }
  if (config.cloudLimits) {
    const used =
      db.select({ total: sql<number>`coalesce(sum(size), 0)` }).from(attachments).get()?.total ?? 0;
    if (used + input.bytes.byteLength > config.cloudLimits.maxStorageBytes) {
      throw apiError('INVALID_ARGUMENT', "This reef's storage is full — tidy up some attachments first");
    }
  }

  const uid = newUid();
  const filename = sanitizeFilename(input.filename);
  const relative = path.join('assets', `${Date.now()}_${uid}_${filename}`);
  const absolute = path.join(config.uploadsDir, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, input.bytes);

  const created = db
    .insert(attachments)
    .values({
      uid,
      creatorId: input.creatorId,
      filename,
      type: input.type || 'application/octet-stream',
      size: input.bytes.byteLength,
      storagePath: relative,
    })
    .returning()
    .get();

  if (queues.ocr && created.type.startsWith('image/')) queues.ocr.enqueue(created.id);
  if (queues.transcribe && created.type.startsWith('audio/')) queues.transcribe.enqueue(created.id);
  return created;
}
