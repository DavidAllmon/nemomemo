import fs from 'node:fs';
import path from 'node:path';
import { nowSeconds } from '../lib/time.js';

/** One nightly restic snapshot as recorded by the host's backup script.
 *  `reefs` is the list of reef slugs staged that night; null = predates the
 *  manifest and hasn't been backfilled — never offered for restore. */
export interface SnapshotEntry {
  id: string;
  time: string;
  reefs: string[] | null;
}

export type RestoreState = 'queued' | 'restoring' | 'staged' | 'failed' | 'done';

/** Shared state machine with the host worker: the app writes queued/done,
 *  the host writes restoring/staged/failed. Keep field names in sync with
 *  deploy/restore-cloud.sh. */
export interface RestoreStatus {
  state: RestoreState;
  snapshotId: string;
  requestedTs: number;
  requestedBy: string;
  updatedTs: number;
  message?: string;
}

export function restorePaths(dataDir: string): {
  queueDir: string;
  stagedDir: string;
  statusDir: string;
  tmpDir: string;
} {
  const root = path.join(dataDir, 'restore');
  return {
    queueDir: path.join(root, 'queue'),
    stagedDir: path.join(root, 'staged'),
    statusDir: path.join(root, 'status'),
    tmpDir: path.join(root, 'tmp'),
  };
}

export function ensureRestoreDirs(dataDir: string): void {
  for (const dir of Object.values(restorePaths(dataDir))) fs.mkdirSync(dir, { recursive: true });
}

export function readSnapshotManifest(dataDir: string): SnapshotEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, 'snapshots.json'), 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as SnapshotEntry[]) : [];
  } catch {
    return [];
  }
}

export function snapshotsForReef(dataDir: string, slug: string): SnapshotEntry[] {
  return readSnapshotManifest(dataDir)
    .filter((entry) => entry.reefs?.includes(slug))
    .sort((a, b) => b.time.localeCompare(a.time));
}

export function readRestoreStatus(dataDir: string, slug: string): RestoreStatus | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(restorePaths(dataDir).statusDir, `${slug}.json`), 'utf8'),
    ) as RestoreStatus;
  } catch {
    return null;
  }
}

/** Atomic write (tmp + rename) so the host worker never reads a half-written file. */
export function writeRestoreStatus(dataDir: string, slug: string, status: RestoreStatus): void {
  ensureRestoreDirs(dataDir);
  const file = path.join(restorePaths(dataDir).statusDir, `${slug}.json`);
  fs.writeFileSync(`${file}.app-tmp`, JSON.stringify(status));
  fs.renameSync(`${file}.app-tmp`, file);
}

export function enqueueRestore(
  dataDir: string,
  slug: string,
  req: { snapshotId: string; requestedBy: string },
): RestoreStatus {
  ensureRestoreDirs(dataDir);
  const now = nowSeconds();
  const status: RestoreStatus = {
    state: 'queued',
    snapshotId: req.snapshotId,
    requestedTs: now,
    requestedBy: req.requestedBy,
    updatedTs: now,
  };
  writeRestoreStatus(dataDir, slug, status);
  const file = path.join(restorePaths(dataDir).queueDir, `${slug}.json`);
  fs.writeFileSync(`${file}.app-tmp`, JSON.stringify({ slug, ...req, requestedTs: now }));
  fs.renameSync(`${file}.app-tmp`, file);
  return status;
}
