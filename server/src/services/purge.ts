import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/index.js';

/**
 * The one hard delete. Removes the given memos, the comment memos hanging off
 * them (whose COMMENT relation rows cascade away, which would otherwise orphan
 * the comment memo itself), and their attachment rows; attachment files are
 * unlinked after the transaction commits.
 *
 * Three callers share this cascade: permanent delete, the Dory sweep, and the
 * trash sweep. Returns how many of the *given* memos were removed — comments
 * swept up along the way belong to their parent's story, not the count.
 */
export function purgeMemos(db: Db, uploadsDir: string, memoIds: number[]): number {
  if (memoIds.length === 0) return 0;
  const sqlite = db.$client;

  const run = sqlite.transaction(() => {
    const ids = [...new Set(memoIds)];
    const placeholders = ids.map(() => '?').join(',');

    const commentIds = (
      sqlite
        .prepare(
          `SELECT memo_id AS id FROM memo_relation WHERE type = 'COMMENT' AND related_memo_id IN (${placeholders})`,
        )
        .all(...ids) as { id: number }[]
    ).map((row) => row.id);

    const allIds = [...new Set([...ids, ...commentIds])];
    const allPlaceholders = allIds.map(() => '?').join(',');

    // Collect attachment files before the rows lose their memo link.
    const files = sqlite
      .prepare(`SELECT id, storage_path FROM attachment WHERE memo_id IN (${allPlaceholders})`)
      .all(...allIds) as { id: number; storage_path: string }[];
    if (files.length > 0) {
      const filePlaceholders = files.map(() => '?').join(',');
      sqlite
        .prepare(`DELETE FROM attachment WHERE id IN (${filePlaceholders})`)
        .run(...files.map((file) => file.id));
    }

    sqlite.prepare(`DELETE FROM memo WHERE id IN (${allPlaceholders})`).run(...allIds);
    return { count: ids.length, files: files.map((file) => file.storage_path) };
  });

  const { count, files } = run();
  for (const relative of files) {
    const filePath = path.join(uploadsDir, relative);
    if (filePath.startsWith(uploadsDir)) fs.rm(filePath, { force: true }, () => {});
  }
  return count;
}
