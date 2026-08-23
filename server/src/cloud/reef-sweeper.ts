import fs from 'node:fs';
import path from 'node:path';
import type { Registry } from './registry.js';
import type { ReefFleet } from './tenants.js';

/** The ToS promise: suspended reefs are deleted after 90 days. */
export const REEF_GRACE_SECONDS = 90 * 24 * 3600;

/**
 * Delete reefs whose suspension outlasted the grace window: evict from the
 * fleet, remove the data directory, mark the registry row canceled (the row
 * itself is kept for bookkeeping). Deliberately loud — every deletion is a log
 * line, and off-VM restic history is the only way back afterwards.
 */
export function sweepExpiredReefs(
  registry: Registry,
  fleet: ReefFleet,
  reefsDir: string,
  now: number,
): number {
  let deleted = 0;
  for (const reef of registry.listSuspendedBefore(now - REEF_GRACE_SECONDS)) {
    fleet.evict(reef.slug);
    const dir = path.join(reefsDir, reef.slug);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    registry.setReefStatusById(reef.id, 'canceled');
    console.log(
      `[cloud] reef ${reef.slug} deleted after the 90-day suspension grace (suspended ${reef.statusChangedTs ?? reef.createdTs})`,
    );
    deleted++;
  }
  return deleted;
}
