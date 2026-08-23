import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { sweepStagedRestores } from '../cloud/restore-sweeper.js';
import { readRestoreStatus, restorePaths, writeRestoreStatus } from '../cloud/snapshots.js';
import { ReefFleet } from '../cloud/tenants.js';

function makeFleetContext(): { scratch: string; fleet: ReefFleet } {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-sweep-test-'));
  const base = loadConfig({ dataDir: scratch, webDistDir: null });
  const fleet = new ReefFleet(base, path.join(scratch, 'reefs'));
  return { scratch, fleet };
}

const marker = (fleet: ReefFleet, slug: string): string =>
  (fleet.get(slug).db.$client.prepare('SELECT v FROM marker').get() as { v: string }).v;

describe('restore sweeper', () => {
  it('swaps a staged dir in: evicts, keeps one safety copy, marks status done', () => {
    const { scratch, fleet } = makeFleetContext();
    const handle = fleet.get('coral'); // creates reefs/coral + runs migrations
    handle.db.$client.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('backup-era')");
    fleet.evict('coral');
    // "Nightly snapshot": a copy of the reef as it is now, placed in staged/.
    const staged = path.join(restorePaths(scratch).stagedDir, 'coral');
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.cpSync(path.join(scratch, 'reefs', 'coral'), staged, { recursive: true });
    // Life goes on after the snapshot:
    fleet.get('coral').db.$client.exec("UPDATE marker SET v = 'current'");
    writeRestoreStatus(scratch, 'coral', {
      state: 'staged',
      snapshotId: 'aaa111bb',
      requestedTs: 1,
      requestedBy: 'keeper',
      updatedTs: 2,
    });

    expect(sweepStagedRestores(fleet, scratch, 1000)).toEqual(['coral']);

    expect(marker(fleet, 'coral')).toBe('backup-era'); // the reef went back in time
    const reefsDir = path.join(scratch, 'reefs');
    const safety = fs.readdirSync(reefsDir).filter((f) => f.startsWith('coral.pre-restore-'));
    expect(safety).toHaveLength(1);
    expect(readRestoreStatus(scratch, 'coral')?.state).toBe('done');
    expect(fs.existsSync(staged)).toBe(false);
  });

  it('keeps only the newest safety copy and ignores non-slug names in staged/', () => {
    const { scratch, fleet } = makeFleetContext();
    fleet.get('coral').db.$client.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('one')");
    fleet.evict('coral');
    const { stagedDir } = restorePaths(scratch);
    fs.mkdirSync(stagedDir, { recursive: true });
    fs.mkdirSync(path.join(stagedDir, 'not.a.slug'), { recursive: true }); // must be ignored
    // First restore cycle:
    fs.cpSync(path.join(scratch, 'reefs', 'coral'), path.join(stagedDir, 'coral'), { recursive: true });
    sweepStagedRestores(fleet, scratch, 1000);
    // Second restore cycle:
    fleet.evict('coral');
    fs.cpSync(path.join(scratch, 'reefs', 'coral'), path.join(stagedDir, 'coral'), { recursive: true });
    sweepStagedRestores(fleet, scratch, 2000);

    const safety = fs.readdirSync(path.join(scratch, 'reefs')).filter((f) => f.startsWith('coral.pre-restore-'));
    expect(safety).toEqual(['coral.pre-restore-2000']); // older copy pruned
    expect(fs.existsSync(path.join(stagedDir, 'not.a.slug'))).toBe(true); // untouched
    expect(sweepStagedRestores(fleet, scratch, 3000)).toEqual([]); // nothing staged → no-op
  });
});
