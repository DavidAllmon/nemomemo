import { TRASH_RETENTION_SECONDS } from '@nemomemo/shared';
import type { Db } from '../db/index.js';
import { nowSeconds } from '../lib/time.js';
import { purgeMemos } from './purge.js';

/**
 * Purge memos that have sat in the trash longer than the retention window.
 * One pass of the scheduler tick — never its own interval.
 */
export function sweepTrash(
  db: Db,
  uploadsDir: string,
  retentionSeconds = TRASH_RETENTION_SECONDS,
  now = nowSeconds(),
): number {
  const ids = (
    db.$client
      .prepare('SELECT id FROM memo WHERE deleted_at IS NOT NULL AND deleted_at <= ?')
      .all(now - retentionSeconds) as { id: number }[]
  ).map((row) => row.id);
  return purgeMemos(db, uploadsDir, ids);
}
