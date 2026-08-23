import fs from 'node:fs';
import path from 'node:path';
import { REEF_SLUG_RE } from './registry.js';
import { readRestoreStatus, restorePaths, writeRestoreStatus } from './snapshots.js';
import type { ReefFleet } from './tenants.js';

/**
 * The app's half of a snapshot restore: the host worker stages a verified
 * reef dir under restore/staged/<slug>; this sweep swaps it in. Entirely
 * synchronous — better-sqlite3 is sync too, so between evict and rename no
 * request can acquire a handle to the half-swapped reef.
 */
export function sweepStagedRestores(
  fleet: ReefFleet,
  dataDir: string,
  nowEpoch = Math.floor(Date.now() / 1000),
): string[] {
  const { stagedDir } = restorePaths(dataDir);
  if (!fs.existsSync(stagedDir)) return [];
  const swapped: string[] = [];
  for (const slug of fs.readdirSync(stagedDir)) {
    if (!REEF_SLUG_RE.test(slug)) continue;
    const staged = path.join(stagedDir, slug);
    if (!fs.statSync(staged).isDirectory()) continue;

    const reefsDir = path.join(dataDir, 'reefs');
    fs.mkdirSync(reefsDir, { recursive: true });
    const reefDir = path.join(reefsDir, slug);

    fleet.evict(slug);
    for (const entry of fs.readdirSync(reefsDir)) {
      if (entry.startsWith(`${slug}.pre-restore-`)) {
        fs.rmSync(path.join(reefsDir, entry), { recursive: true, force: true });
      }
    }
    if (fs.existsSync(reefDir)) fs.renameSync(reefDir, `${reefDir}.pre-restore-${nowEpoch}`);
    fs.renameSync(staged, reefDir);

    const status = readRestoreStatus(dataDir, slug);
    if (status) writeRestoreStatus(dataDir, slug, { ...status, state: 'done', updatedTs: nowEpoch });
    console.log(`[cloud] reef ${slug} restored from snapshot ${status?.snapshotId ?? '(unknown)'}`);
    swapped.push(slug);
  }
  return swapped;
}
