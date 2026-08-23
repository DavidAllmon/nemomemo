import type Database from 'better-sqlite3';
import { buildMemoPayload } from '@nemomemo/shared';

/**
 * memo.payload is derived, never authoritative — when extraction gains fields,
 * older rows are stale until rewritten (see GOTCHAS). SQL migrations can't run
 * the remark walk, so this runs at every boot instead: it rewrites only rows
 * missing the newest payload field, inside one transaction, and never touches
 * content (so the FTS triggers stay quiet). Cloud reefs open through createDb
 * too, so each tenant heals on first open after an upgrade.
 */
export function backfillPayloads(sqlite: Database.Database): number {
  const stale = sqlite
    .prepare(
      "SELECT id, content FROM memo WHERE json_extract(payload, '$.property.incompleteTasks') IS NULL",
    )
    .all() as { id: number; content: string }[];
  if (stale.length === 0) return 0;
  const update = sqlite.prepare('UPDATE memo SET payload = ? WHERE id = ?');
  const run = sqlite.transaction(() => {
    for (const row of stale) update.run(buildMemoPayload(row.content).payload, row.id);
  });
  run();
  return stale.length;
}
