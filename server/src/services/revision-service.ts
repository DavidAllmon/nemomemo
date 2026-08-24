import { REVISION_KEEP_COUNT, REVISION_RETENTION_SECONDS } from '@nemomemo/shared';
import type { Db } from '../db/index.js';

export interface RevisionRow {
  id: number;
  content: string;
  created_ts: number;
}

/**
 * Store the content an edit is about to replace. Call BEFORE the update,
 * inside the same transaction, so the revision and the new content commit
 * together or not at all.
 */
export function captureRevision(db: Db, memoId: number, content: string, now: number): void {
  db.$client
    .prepare('INSERT INTO memo_revision (memo_id, content, created_ts) VALUES (?, ?, ?)')
    .run(memoId, content, now);
}

/** Newest first; capped at what the prune keeps anyway. */
export function listRevisions(db: Db, memoId: number): RevisionRow[] {
  return db.$client
    .prepare(
      `SELECT id, content, created_ts FROM memo_revision
       WHERE memo_id = ? ORDER BY created_ts DESC, id DESC LIMIT ?`,
    )
    .all(memoId, REVISION_KEEP_COUNT) as RevisionRow[];
}

/** Scheduler pass: age out past the retention window, then cap the pile per memo. */
export function pruneRevisions(db: Db, now: number): number {
  const aged = db.$client
    .prepare('DELETE FROM memo_revision WHERE created_ts <= ?')
    .run(now - REVISION_RETENTION_SECONDS).changes;
  const over = db.$client
    .prepare(
      `DELETE FROM memo_revision WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY memo_id ORDER BY created_ts DESC, id DESC) AS rn
           FROM memo_revision
         ) WHERE rn > ?
       )`,
    )
    .run(REVISION_KEEP_COUNT).changes;
  return aged + over;
}
