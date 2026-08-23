import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  enqueueRestore,
  readRestoreStatus,
  readSnapshotManifest,
  restorePaths,
  snapshotsForReef,
  writeRestoreStatus,
  type RestoreStatus,
} from '../cloud/snapshots.js';

const MANIFEST = [
  { id: 'aaa111bb', time: '2026-08-22T07:17:01Z', reefs: ['coral', 'anemone'] },
  { id: 'bbb222cc', time: '2026-08-21T07:17:01Z', reefs: ['anemone'] },
  { id: 'ccc333dd', time: '2026-08-20T07:17:01Z', reefs: null },
];

function emptyDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-snap-test-'));
}

function scratchDataDir(manifest: unknown = MANIFEST): string {
  const dir = emptyDataDir();
  fs.writeFileSync(path.join(dir, 'snapshots.json'), JSON.stringify(manifest));
  return dir;
}

describe('snapshot manifest', () => {
  it('reads the manifest and filters to snapshots that hold the reef, newest first', () => {
    const dataDir = scratchDataDir();
    expect(readSnapshotManifest(dataDir)).toHaveLength(3);
    const coral = snapshotsForReef(dataDir, 'coral');
    expect(coral.map((s) => s.id)).toEqual(['aaa111bb']); // null-reef entries excluded
    const anemone = snapshotsForReef(dataDir, 'anemone');
    expect(anemone.map((s) => s.id)).toEqual(['aaa111bb', 'bbb222cc']);
  });

  it('treats a missing or corrupt manifest as empty', () => {
    const missing = emptyDataDir();
    expect(readSnapshotManifest(missing)).toEqual([]);
    const corrupt = scratchDataDir();
    fs.writeFileSync(path.join(corrupt, 'snapshots.json'), 'not json');
    expect(readSnapshotManifest(corrupt)).toEqual([]);
  });
});

describe('restore status + queue files', () => {
  it('round-trips status and returns null when absent', () => {
    const dataDir = scratchDataDir();
    expect(readRestoreStatus(dataDir, 'coral')).toBeNull();
    const status: RestoreStatus = {
      state: 'queued',
      snapshotId: 'aaa111bb',
      requestedTs: 100,
      requestedBy: 'reefkeeper',
      updatedTs: 100,
    };
    writeRestoreStatus(dataDir, 'coral', status);
    expect(readRestoreStatus(dataDir, 'coral')).toEqual(status);
  });

  it('enqueueRestore writes the queue file and a queued status', () => {
    const dataDir = scratchDataDir();
    const status = enqueueRestore(dataDir, 'coral', { snapshotId: 'aaa111bb', requestedBy: 'reefkeeper' });
    expect(status.state).toBe('queued');
    const queued = JSON.parse(
      fs.readFileSync(path.join(restorePaths(dataDir).queueDir, 'coral.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(queued.slug).toBe('coral');
    expect(queued.snapshotId).toBe('aaa111bb');
    expect(queued.requestedBy).toBe('reefkeeper');
    expect(readRestoreStatus(dataDir, 'coral')?.state).toBe('queued');
  });
});
