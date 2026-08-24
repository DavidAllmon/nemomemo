import type { Db } from '../db/index.js';
import { nowSeconds } from '../lib/time.js';
import { purgeMemos } from './purge.js';

/**
 * Delete every memo Dory has forgotten, bumping each creator's forgotten
 * counter. Memos already in the trash are skipped — the trash sweep owns those,
 * and "Dory forgot 3 memos for you" shouldn't count ones you threw away
 * yourself. The cascade (comments, attachments, files) lives in purgeMemos.
 * Returns the number of forgotten memos.
 */
export function sweepDoryMemos(db: Db, uploadsDir: string): number {
  const now = nowSeconds();
  const sqlite = db.$client;

  const expired = sqlite
    .prepare(
      'SELECT id, creator_id FROM memo WHERE forget_at IS NOT NULL AND forget_at <= ? AND deleted_at IS NULL',
    )
    .all(now) as { id: number; creator_id: number }[];
  if (expired.length === 0) return 0;

  // "Dory has forgotten N memos for you" — count the directly-expired memos
  // per creator (cascaded comments belong to other stories).
  const byCreator = new Map<number, number>();
  for (const row of expired) byCreator.set(row.creator_id, (byCreator.get(row.creator_id) ?? 0) + 1);
  const bump = sqlite.transaction(() => {
    const stmt = sqlite.prepare(
      'UPDATE user SET dory_forgotten_count = dory_forgotten_count + ? WHERE id = ?',
    );
    for (const [creatorId, count] of byCreator) stmt.run(count, creatorId);
  });
  bump();

  return purgeMemos(db, uploadsDir, expired.map((row) => row.id));
}
