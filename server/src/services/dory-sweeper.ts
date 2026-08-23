import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/index.js';
import { nowSeconds } from '../lib/time.js';

/**
 * Delete every memo Dory has forgotten. FK cascades clean up relations,
 * reactions, shares, and inbox rows; comment memos left behind by the cascade
 * and attachment files on disk are cleaned in follow-up passes.
 * Returns the number of forgotten memos.
 */
export function sweepDoryMemos(db: Db, uploadsDir: string): number {
  const now = nowSeconds();
  const sqlite = db.$client;

  const sweep = sqlite.transaction(() => {
    const expired = sqlite
      .prepare('SELECT id, creator_id FROM memo WHERE forget_at IS NOT NULL AND forget_at <= ?')
      .all(now) as { id: number; creator_id: number }[];
    if (expired.length === 0) return 0;
    const ids = expired.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');

    // "Dory has forgotten N memos for you" — count the directly-expired memos
    // per creator (cascaded comments belong to other stories).
    const byCreator = new Map<number, number>();
    for (const row of expired) byCreator.set(row.creator_id, (byCreator.get(row.creator_id) ?? 0) + 1);
    const bump = sqlite.prepare(
      'UPDATE user SET dory_forgotten_count = dory_forgotten_count + ? WHERE id = ?',
    );
    for (const [creatorId, count] of byCreator) bump.run(count, creatorId);

    // Comment memos hanging off the expired memos (their COMMENT relation rows
    // will cascade away, which would orphan the comment memo itself).
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

    // File deletion happens after commit via the returned list.
    return { count: ids.length, files: files.map((file) => file.storage_path) } as never;
  });

  const result = sweep() as unknown as number | { count: number; files: string[] };
  if (typeof result === 'number') return result;

  for (const relative of result.files) {
    const filePath = path.join(uploadsDir, relative);
    if (filePath.startsWith(uploadsDir)) {
      fs.rm(filePath, { force: true }, () => {});
    }
  }
  return result.count;
}

