# Cloud Snapshot Browser + One-Click Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cloud reefkeeper opens Settings → Backups, sees the list of nightly restic snapshots that contain their reef, picks a date, and the reef is restored to it — with restic credentials never entering the app container.

**Architecture:** File-queue over the shared cloud data volume. The host (which has restic creds in `/opt/nemomemo-deploy/backup.env`) runs a cron worker that services restore requests into a staging dir; the app runs a 10 s sweeper that performs evict → swap → reopen. The nightly backup script writes a `snapshots.json` manifest the app reads. Neither side ever calls the other over the network.

**Tech Stack:** Hono routes in the cloud router (`server/src/cloud/`), better-sqlite3/ReefFleet, bash + restic + jq on the VM host, React/TanStack Query in `web/`.

**Spec:** `docs/superpowers/specs/2026-08-23-cloud-snapshot-browser-design.md` (approved by David 2026-08-23)

## Global Constraints

- **Restic credentials never enter an app container** — no `RESTIC_*` reads anywhere under `server/`; the container only reads/writes plain files in the data volume.
- **Ship dark:** zero behavior change for single-tenant; `pnpm typecheck && pnpm test && pnpm build` green before every push; extend `cloud-isolation.test.ts`.
- **Push to main = production in ~4–8 min.** App-code pushes go through `pnpm release [minor]` (two-run flow, both changelog sections) + `git push --follow-tags`.
- **TDD** for all server work: failing test first, watch it fail, minimal code, watch it pass.
- **Reef voice** in user-facing copy: what happened, what to do next, then the fish.
- Repo is public: no secrets, IPs, or customer data in code/docs/commits. (The VM IP lives only in the private memory, never in the repo.)
- File layout under the cloud data dir (`$DATA` = the volume root, `base.dataDir` in code): `snapshots.json`, `restore/queue/`, `restore/staged/`, `restore/status/`, `restore/tmp/`, alongside existing `registry.db` and `reefs/<slug>/`.

---

### Task 1: Snapshot manifest + restore-status file layer (`snapshots.ts` data half)

**Files:**
- Create: `server/src/cloud/snapshots.ts`
- Test: `server/src/test/cloud-snapshots.test.ts`

**Interfaces:**
- Consumes: nothing new (node `fs`/`path`, `nowSeconds` from `server/src/lib/time.js`).
- Produces (used by Tasks 2, 3, and the host scripts' file contract):
  - `interface SnapshotEntry { id: string; time: string; reefs: string[] | null }`
  - `type RestoreState = 'queued' | 'restoring' | 'staged' | 'failed' | 'done'`
  - `interface RestoreStatus { state: RestoreState; snapshotId: string; requestedTs: number; requestedBy: string; updatedTs: number; message?: string }`
  - `restorePaths(dataDir: string): { queueDir: string; stagedDir: string; statusDir: string; tmpDir: string }`
  - `ensureRestoreDirs(dataDir: string): void`
  - `readSnapshotManifest(dataDir: string): SnapshotEntry[]`
  - `snapshotsForReef(dataDir: string, slug: string): SnapshotEntry[]`
  - `readRestoreStatus(dataDir: string, slug: string): RestoreStatus | null`
  - `writeRestoreStatus(dataDir: string, slug: string, status: RestoreStatus): void`
  - `enqueueRestore(dataDir: string, slug: string, req: { snapshotId: string; requestedBy: string }): RestoreStatus`

- [ ] **Step 1: Write the failing tests**

Create `server/src/test/cloud-snapshots.test.ts`:

```ts
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

function scratchDataDir(manifest: unknown = MANIFEST): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-snap-test-'));
  if (manifest !== undefined) fs.writeFileSync(path.join(dir, 'snapshots.json'), JSON.stringify(manifest));
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
    const missing = scratchDataDir(undefined);
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
      state: 'queued', snapshotId: 'aaa111bb', requestedTs: 100, requestedBy: 'reefkeeper', updatedTs: 100,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/cloud-snapshots.test.ts`
Expected: FAIL — cannot resolve `../cloud/snapshots.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/cloud/snapshots.ts`:

```ts
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
  const paths = restorePaths(dataDir);
  for (const dir of Object.values(paths)) fs.mkdirSync(dir, { recursive: true });
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/cloud-snapshots.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/cloud/snapshots.ts server/src/test/cloud-snapshots.test.ts
git commit -m "cloud: snapshot manifest + restore status/queue file layer"
```

---

### Task 2: Reef-scoped snapshot API (browse + request)

**Files:**
- Modify: `server/src/cloud/snapshots.ts` (append the handler)
- Modify: `server/src/cloud/app.ts` (new `dataDir` param; intercept `/api/v1/cloud/snapshots` even without billing)
- Modify: `server/src/cloud/index.ts:59` (pass `base.dataDir`)
- Modify: `server/src/test/cloud-isolation.test.ts:26` and `server/src/test/cloud-billing.test.ts:95` (updated signature)
- Test: `server/src/test/cloud-snapshots.test.ts` (append route tests), `server/src/test/cloud-isolation.test.ts` (append isolation tests)

**Interfaces:**
- Consumes: Task 1's functions/types; `resolveSessionViewer`, `SESSION_COOKIE` from `../middleware/auth.js`; `ReefHandle` from `./tenants.js`.
- Produces:
  - `handleSnapshotApi(dataDir: string, slug: string, handle: ReefHandle, c: Context): Promise<Response>` in `snapshots.ts`
  - `makeCloudApp(registry, fleet, settings, dataDir: string, billing?)` — **new required 4th parameter**, billing moves to 5th
  - HTTP: `GET /api/v1/cloud/snapshots` → `{ snapshots: {id, time}[], restore: RestoreStatus | null }`; `POST /api/v1/cloud/snapshots/restore` body `{ snapshotId: string }` → 202 `{ restore: RestoreStatus }`, 404 unknown id, 409 already pending. Both reefkeeper-only (403 otherwise).

- [ ] **Step 1: Write the failing route tests**

Append to `server/src/test/cloud-snapshots.test.ts` (the helpers mirror `cloud-isolation.test.ts`, plus `dataDir`):

```ts
import type { Hono } from 'hono';
import { loadConfig } from '../config.js';
import { makeCloudApp } from '../cloud/app.js';
import { Registry } from '../cloud/registry.js';
import { ReefFleet } from '../cloud/tenants.js';

const BASE_DOMAIN = 'reef.test';

function makeSnapshotTestContext(): { app: Hono; scratch: string } {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-snaproute-test-'));
  fs.writeFileSync(path.join(scratch, 'snapshots.json'), JSON.stringify(MANIFEST));
  const base = loadConfig({ dataDir: scratch, webDistDir: null });
  const registry = new Registry(path.join(scratch, 'registry.db'));
  registry.createReef('coral');
  const fleet = new ReefFleet(base, path.join(scratch, 'reefs'));
  const app = makeCloudApp(registry, fleet, { baseDomain: BASE_DOMAIN, appHost: `app.${BASE_DOMAIN}` }, scratch);
  return { app, scratch };
}

async function hostRequest(app: Hono, method: string, host: string, pathname: string, body?: unknown, cookie?: string) {
  return app.request(`http://${host}${pathname}`, {
    method,
    headers: {
      host,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function hostSignup(app: Hono, host: string, username: string): Promise<string> {
  const response = await hostRequest(app, 'POST', host, '/api/v1/auth/signup', {
    username, email: `${username}@${host}`, password: 'password123',
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

describe('GET/POST /api/v1/cloud/snapshots', () => {
  const host = `coral.${BASE_DOMAIN}`;

  it("reefkeeper sees only this reef's snapshot dates; members and anonymous are refused", async () => {
    const { app } = makeSnapshotTestContext();
    const keeper = await hostSignup(app, host, 'keeper'); // first signup = ADMIN
    const member = await hostSignup(app, host, 'guppy');

    const ok = await hostRequest(app, 'GET', host, '/api/v1/cloud/snapshots', undefined, keeper);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { snapshots: { id: string }[]; restore: unknown };
    expect(body.snapshots.map((s) => s.id)).toEqual(['aaa111bb']);
    expect(body.restore).toBeNull();

    expect((await hostRequest(app, 'GET', host, '/api/v1/cloud/snapshots', undefined, member)).status).toBe(403);
    expect((await hostRequest(app, 'GET', host, '/api/v1/cloud/snapshots')).status).toBe(403);
  });

  it('restore request queues once, refuses unknown snapshots and double-requests', async () => {
    const { app, scratch } = makeSnapshotTestContext();
    const keeper = await hostSignup(app, host, 'keeper');

    const unknown = await hostRequest(app, 'POST', host, '/api/v1/cloud/snapshots/restore', { snapshotId: 'nope0000' }, keeper);
    expect(unknown.status).toBe(404);
    // bbb222cc exists but holds only anemone — coral can't restore to it.
    const wrongReef = await hostRequest(app, 'POST', host, '/api/v1/cloud/snapshots/restore', { snapshotId: 'bbb222cc' }, keeper);
    expect(wrongReef.status).toBe(404);

    const ok = await hostRequest(app, 'POST', host, '/api/v1/cloud/snapshots/restore', { snapshotId: 'aaa111bb' }, keeper);
    expect(ok.status).toBe(202);
    expect(((await ok.json()) as { restore: { state: string } }).restore.state).toBe('queued');
    expect(fs.existsSync(path.join(scratch, 'restore', 'queue', 'coral.json'))).toBe(true);

    const again = await hostRequest(app, 'POST', host, '/api/v1/cloud/snapshots/restore', { snapshotId: 'aaa111bb' }, keeper);
    expect(again.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/cloud-snapshots.test.ts`
Expected: FAIL — `makeCloudApp` called with 4 args / route returns 404.

- [ ] **Step 3: Implement the handler and wire the router**

Append to `server/src/cloud/snapshots.ts`:

```ts
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { resolveSessionViewer, SESSION_COOKIE } from '../middleware/auth.js';
import type { ReefHandle } from './tenants.js';
```
(merge these with the existing imports at the top of the file), then:

```ts
const PENDING_STATES: RestoreState[] = ['queued', 'restoring', 'staged'];

/** Reefkeeper-only snapshot browsing + restore requests. Works with or
 *  without Stripe billing — backups are not a billing feature. */
export async function handleSnapshotApi(
  dataDir: string,
  slug: string,
  handle: ReefHandle,
  c: Context,
): Promise<Response> {
  const token = getCookie(c, SESSION_COOKIE);
  const viewer = token ? resolveSessionViewer(handle.db, token) : null;
  if (!viewer || viewer.user.role !== 'ADMIN') {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Reefkeeper access required' } }, 403);
  }

  const pathname = new URL(c.req.url).pathname;

  if (c.req.method === 'GET' && pathname === '/api/v1/cloud/snapshots') {
    return c.json({
      snapshots: snapshotsForReef(dataDir, slug).map(({ id, time }) => ({ id, time })),
      restore: readRestoreStatus(dataDir, slug),
    });
  }

  if (c.req.method === 'POST' && pathname === '/api/v1/cloud/snapshots/restore') {
    let snapshotId = '';
    try {
      snapshotId = String(((await c.req.json()) as { snapshotId?: unknown }).snapshotId ?? '');
    } catch {
      // fall through to the not-found reply below
    }
    const entry = snapshotsForReef(dataDir, slug).find((s) => s.id === snapshotId);
    if (!entry) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: "No snapshot of this reef on that date — it may predate the reef. Just keep swimming" } },
        404,
      );
    }
    const current = readRestoreStatus(dataDir, slug);
    if (current && PENDING_STATES.includes(current.state)) {
      return c.json(
        { error: { code: 'FAILED_PRECONDITION', message: 'A restore is already in progress — one wave at a time 🌊' } },
        409,
      );
    }
    const restore = enqueueRestore(dataDir, slug, { snapshotId, requestedBy: viewer.user.username });
    return c.json({ restore }, 202);
  }

  return c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404);
}
```

In `server/src/cloud/app.ts`: add `import { handleSnapshotApi } from './snapshots.js';`, change the signature to

```ts
export function makeCloudApp(
  registry: Registry,
  fleet: ReefFleet,
  settings: CloudSettings,
  dataDir: string,
  billing?: BillingDeps,
): Hono {
```

and replace the tail of the reef branch (currently `const handle = fleet.get(slug); if (billing && …)`) with:

```ts
    const handle = fleet.get(slug);
    const pathname = new URL(c.req.url).pathname;
    if (pathname.startsWith('/api/v1/cloud/snapshots')) {
      return handleSnapshotApi(dataDir, slug, handle, c);
    }
    if (billing && pathname.startsWith('/api/v1/cloud/')) {
      return handleReefCloudApi(billing, reef, handle, c);
    }
    return handle.app.fetch(c.req.raw);
```

Update the three call sites:
- `server/src/cloud/index.ts:59` → `makeCloudApp(registry, fleet, settings, base.dataDir, billing)`
- `server/src/test/cloud-isolation.test.ts:26` → `makeCloudApp(registry, fleet, { baseDomain: BASE_DOMAIN, appHost: APP_HOST }, scratch)`
- `server/src/test/cloud-billing.test.ts:95` → insert the context's scratch dir as the 4th argument, existing billing object becomes 5th (read the surrounding function to find its scratch variable name).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/cloud-snapshots.test.ts src/test/cloud-isolation.test.ts src/test/cloud-billing.test.ts`
Expected: PASS, including all pre-existing isolation/billing tests.

- [ ] **Step 5: Write the failing isolation tests**

Append to `server/src/test/cloud-isolation.test.ts` (inside the existing describe, reusing its `makeCloudTestContext`, `reefRequest`, `reefSignup` helpers and `scratch`):

```ts
  it('snapshot browsing is reef-scoped: reef A never sees reef B-only snapshots, and the route is absent single-tenant', async () => {
    const ctx = makeCloudTestContext();
    ctx.registry.createReef('reef-a');
    ctx.registry.createReef('reef-b');
    fs.writeFileSync(
      path.join(ctx.scratch, 'snapshots.json'),
      JSON.stringify([
        { id: 'aaaa1111', time: '2026-08-22T07:17:01Z', reefs: ['reef-a', 'reef-b'] },
        { id: 'bbbb2222', time: '2026-08-21T07:17:01Z', reefs: ['reef-b'] },
      ]),
    );
    const keeperA = await reefSignup(ctx.app, `reef-a.${BASE_DOMAIN}`, 'keeper');
    const listed = await reefRequest(ctx.app, 'GET', `reef-a.${BASE_DOMAIN}`, '/api/v1/cloud/snapshots', undefined, keeperA);
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { snapshots: { id: string }[] };
    expect(body.snapshots.map((s) => s.id)).toEqual(['aaaa1111']); // never bbbb2222

    // Reef A's keeper cannot restore to a snapshot that only holds reef B.
    const cross = await reefRequest(ctx.app, 'POST', `reef-a.${BASE_DOMAIN}`, '/api/v1/cloud/snapshots/restore', { snapshotId: 'bbbb2222' }, keeperA);
    expect(cross.status).toBe(404);
  });
```

Also add one single-tenant guard to the same file (or its existing single-tenant section if one exists):

```ts
  it('the snapshot routes do not exist on a single-tenant reef', async () => {
    const { makeTestApp, signup, jsonRequest } = await import('./helpers.js');
    const single = makeTestApp();
    const cookie = await signup(single.app, 'reefkeeper');
    const response = await jsonRequest(single.app, 'GET', '/api/v1/cloud/snapshots', undefined, cookie);
    expect(response.status).toBe(404);
  });
```

(`registry.createReef(slug)` — verify the actual method name/signature in `server/src/cloud/registry.ts` before using; the existing isolation tests already create reefs, copy their pattern exactly.)

- [ ] **Step 6: Run, fix, and verify green**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/cloud-isolation.test.ts`
Expected: PASS (the production code from Step 3 should already satisfy these; if a helper mismatch fails, fix the test to match the file's real helpers, not the production code).

- [ ] **Step 7: Full server suite + typecheck, then commit**

Run: `pnpm --filter @nemomemo/server exec vitest run && pnpm typecheck`
Expected: all green.

```bash
git add server/src/cloud/ server/src/test/
git commit -m "cloud: reef-scoped snapshot browse + restore-request API"
```

---

### Task 3: In-app restore sweeper (evict → swap → reopen)

**Files:**
- Create: `server/src/cloud/restore-sweeper.ts`
- Modify: `server/src/cloud/index.ts` (wire a 10 s interval + `ensureRestoreDirs` at boot)
- Test: `server/src/test/cloud-restore-sweeper.test.ts`

**Interfaces:**
- Consumes: `ReefFleet` (`evict`, `get`), `REEF_SLUG_RE` from `./registry.js`, Task 1's `restorePaths`/`readRestoreStatus`/`writeRestoreStatus`.
- Produces: `sweepStagedRestores(fleet: ReefFleet, dataDir: string, nowEpoch?: number): string[]` — returns the slugs swapped this pass. **Fully synchronous** (no awaits) so no request can interleave with a swap.

- [ ] **Step 1: Write the failing tests**

Create `server/src/test/cloud-restore-sweeper.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { restorePaths, writeRestoreStatus, readRestoreStatus } from '../cloud/snapshots.js';
import { sweepStagedRestores } from '../cloud/restore-sweeper.js';
import { ReefFleet } from '../cloud/tenants.js';

function makeFleetContext() {
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
      state: 'staged', snapshotId: 'aaa111bb', requestedTs: 1, requestedBy: 'keeper', updatedTs: 2,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/cloud-restore-sweeper.test.ts`
Expected: FAIL — cannot resolve `../cloud/restore-sweeper.js`.

- [ ] **Step 3: Implement the sweeper**

Create `server/src/cloud/restore-sweeper.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/cloud-restore-sweeper.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `startCloud`**

In `server/src/cloud/index.ts`, add imports `import { sweepStagedRestores } from './restore-sweeper.js';` and `import { ensureRestoreDirs } from './snapshots.js';`. Right after the `reefSweepTimer` block, add:

```ts
  // Snapshot rollback: the host worker stages verified restores into the
  // volume; we swap them in. 10s cadence — an idle scan is one readdir.
  ensureRestoreDirs(base.dataDir);
  const restoreSweep = () => {
    try {
      sweepStagedRestores(fleet, base.dataDir);
    } catch (error) {
      console.error('[cloud] restore sweep failed:', error);
    }
  };
  restoreSweep();
  const restoreTimer = setInterval(restoreSweep, 10_000);
  restoreTimer.unref?.();
```

- [ ] **Step 6: Full gate, then commit**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

```bash
git add server/src/cloud/ server/src/test/cloud-restore-sweeper.test.ts
git commit -m "cloud: restore sweeper swaps staged snapshot restores into the fleet"
```

---

### Task 4: Host scripts — manifest, restic worker, backfill, cron

**Files:**
- Modify: `deploy/backup-cloud.sh` (fixed stage path + manifest)
- Create: `deploy/restore-cloud.sh`
- Create: `deploy/backfill-snapshot-manifest.sh`
- Modify: `deploy/cloud-vm-setup.sh` (jq + cron install, idempotent)

No vitest here — verification is `bash -n` + (if installed) `shellcheck`, plus the Task 7 VM drill. The file contract with the app (paths, status JSON fields) is pinned by Task 1's tests.

- [ ] **Step 1: Fix the stage path and write the manifest in `backup-cloud.sh`**

Replace `STAGE=$(mktemp -d /tmp/nemomemo-backup.XXXXXX)` with:

```bash
# Fixed stage path: stable restic paths across nights (better parent detection,
# and per-reef restores can --include a predictable prefix).
STAGE=/tmp/nemomemo-backup-stage
rm -rf "$STAGE"
mkdir -p "$STAGE"
```

(keep the existing `trap 'rm -rf "$STAGE"' EXIT` line). Then, after the `restic forget … --prune` line, add:

```bash
# Manifest for the in-app snapshot browser: ids, dates, and which reefs each
# snapshot holds. No secrets — the app container reads this file.
SNAPS=$(restic snapshots --tag nemomemo-cloud --json)
PREV=$(cat "$DATA/snapshots.json" 2>/dev/null || echo '[]')
REEFS=$(ls -1 "$STAGE/reefs" 2>/dev/null | jq -R . | jq -sc .)
jq -n --argjson snaps "$SNAPS" --argjson prev "$PREV" --argjson reefs "$REEFS" '
  ($prev | map({key: .id, value: .reefs}) | from_entries) as $known
  | $snaps | sort_by(.time) | reverse
  | map({id: .short_id, time: .time, reefs: ($known[.short_id] // null)})
  | if length > 0 then .[0].reefs = (.[0].reefs // $reefs) else . end
' > "$DATA/snapshots.json.tmp" && mv "$DATA/snapshots.json.tmp" "$DATA/snapshots.json"
```

- [ ] **Step 2: Create `deploy/restore-cloud.sh`**

```bash
#!/usr/bin/env bash
# Host-side half of the in-app snapshot browser (spec:
# docs/superpowers/specs/2026-08-23-cloud-snapshot-browser-design.md).
# Cron runs this every minute. It services restore requests the cloud app
# queues as files, using the restic creds that live ONLY on the host:
#   queue/<slug>.json -> restic restore -> integrity check -> staged/<slug>/
# The app's sweeper does the actual swap; this script never touches reefs/.
set -Eeuo pipefail

ENV_FILE=/opt/nemomemo-deploy/backup.env
[[ -f $ENV_FILE ]] || exit 0
set -a; source "$ENV_FILE"; set +a

# One run at a time; a crashed run's .working files are requeued next minute.
exec 9>/var/lock/nemomemo-restore.lock
flock -n 9 || exit 0

DATA=$(docker volume inspect nemomemo-deploy_cloud-data --format '{{.Mountpoint}}')
QUEUE="$DATA/restore/queue"; STATUS="$DATA/restore/status"
STAGED="$DATA/restore/staged"; TMPROOT="$DATA/restore/tmp"
[[ -d $QUEUE ]] || exit 0
mkdir -p "$STATUS" "$STAGED" "$TMPROOT"
shopt -s nullglob

set_status() { # slug state [message] — merges over the app-written request fields
  local slug=$1 state=$2 message=${3:-}
  jq -n --argjson prev "$(cat "$STATUS/$slug.json" 2>/dev/null || echo '{}')" \
        --arg state "$state" --arg message "$message" --argjson now "$(date +%s)" \
        '$prev + {state: $state, updatedTs: $now}
         + (if $message == "" then {} else {message: $message} end)' \
    > "$STATUS/$slug.json.tmp" && mv "$STATUS/$slug.json.tmp" "$STATUS/$slug.json"
}

# Requeue leftovers from a crashed run (we hold the lock, so none are live).
for stale in "$QUEUE"/*.working; do mv "$stale" "${stale%.working}"; done

for req in "$QUEUE"/*.json; do
  slug=$(basename "$req" .json)
  [[ $slug =~ ^[a-z0-9](-?[a-z0-9]){0,39}$ ]] || { rm -f "$req"; continue; }
  work="$req.working"; mv "$req" "$work"
  snap=$(jq -r '.snapshotId // empty' "$work")
  if [[ ! $snap =~ ^[0-9a-f]{8,64}$ ]]; then
    set_status "$slug" failed "That restore request made no sense — try again from Settings"
    rm -f "$work"; continue
  fi

  set_status "$slug" restoring
  tmp="$TMPROOT/$slug"; rm -rf "$tmp"
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') restoring $slug from $snap"
  if ! restic restore "$snap" --target "$tmp" --include "*/reefs/$slug"; then
    set_status "$slug" failed "We couldn't pull that snapshot back — support has been logged, try another date"
    rm -rf "$tmp"; rm -f "$work"; continue
  fi
  dir=$(find "$tmp" -type d -path "*/reefs/$slug" | head -1)
  if [[ -z $dir || ! -f $dir/nemomemo.db ]]; then
    set_status "$slug" failed "That snapshot has no copy of this reef — pick a later date"
    rm -rf "$tmp"; rm -f "$work"; continue
  fi
  if [[ $(sqlite3 "$dir/nemomemo.db" 'PRAGMA integrity_check;') != ok ]]; then
    set_status "$slug" failed "The snapshot failed its health check — nothing was changed"
    rm -rf "$tmp"; rm -f "$work"; continue
  fi

  rm -rf "${STAGED:?}/$slug"
  mv "$dir" "$STAGED/$slug"   # same filesystem as the volume: atomic
  set_status "$slug" staged
  rm -rf "$tmp"; rm -f "$work"
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') staged $slug from $snap — app will swap it in"
done
```

Then: `chmod +x deploy/restore-cloud.sh`

- [ ] **Step 3: Create `deploy/backfill-snapshot-manifest.sh`**

```bash
#!/usr/bin/env bash
# One-time: give pre-manifest snapshots their reef lists so history shows up
# in the in-app snapshot browser. Safe to re-run (only fills null entries).
set -Eeuo pipefail
set -a; source /opt/nemomemo-deploy/backup.env; set +a
DATA=$(docker volume inspect nemomemo-deploy_cloud-data --format '{{.Mountpoint}}')
MANIFEST="$DATA/snapshots.json"
PREV=$(cat "$MANIFEST" 2>/dev/null || echo '[]')
OUT='[]'
while read -r short time; do
  reefs=$(jq -c --arg id "$short" 'map(select(.id == $id)) | .[0].reefs // null' <<<"$PREV")
  if [[ $reefs == null ]]; then
    reefs=$(restic ls "$short" 2>/dev/null | grep -oE '/reefs/[a-z0-9-]+/' \
      | sed 's#/reefs/##; s#/##' | sort -u | jq -R . | jq -sc .)
    [[ -z $reefs ]] && reefs='[]'
  fi
  OUT=$(jq -c --arg id "$short" --arg time "$time" --argjson reefs "$reefs" \
    '. + [{id: $id, time: $time, reefs: $reefs}]' <<<"$OUT")
done < <(restic snapshots --tag nemomemo-cloud --json | jq -r 'sort_by(.time) | reverse | .[] | "\(.short_id) \(.time)"')
jq . <<<"$OUT" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
echo "manifest holds $(jq length <<<"$OUT") snapshots"
```

Then: `chmod +x deploy/backfill-snapshot-manifest.sh`

- [ ] **Step 4: Idempotent cron + jq install in `cloud-vm-setup.sh`**

Append before the script's final line:

```bash
# --- snapshot restore worker (in-app snapshot browser's host-side half) ---
command -v jq >/dev/null 2>&1 || apt-get install -y jq
if [[ ! -f /etc/cron.d/nemomemo-restore ]]; then
  echo '* * * * * root /opt/nemomemo/deploy/restore-cloud.sh >> /opt/nemomemo-deploy/restore.log 2>&1' \
    > /etc/cron.d/nemomemo-restore
  echo "installed restore cron"
fi
```

- [ ] **Step 5: Syntax-verify all four scripts**

Run: `bash -n deploy/backup-cloud.sh deploy/restore-cloud.sh deploy/backfill-snapshot-manifest.sh deploy/cloud-vm-setup.sh && (command -v shellcheck >/dev/null && shellcheck deploy/restore-cloud.sh deploy/backfill-snapshot-manifest.sh || echo "shellcheck not installed — skipped")`
Expected: no syntax errors (fix any shellcheck findings that are real).

- [ ] **Step 6: Commit**

```bash
git add deploy/
git commit -m "deploy: restic restore worker + snapshot manifest for the in-app browser"
```

---

### Task 5: Web UI — snapshot list + restore flow in the cloud Backups tab

**Files:**
- Modify: `web/src/hooks/queries.ts` (key + `useCloudSnapshots` hook + `CloudSnapshotInfo` type)
- Modify: `web/src/pages/Settings.tsx` (new card inside the `isCloud` branch of `BackupsSection`)

**Interfaces:**
- Consumes: Task 2's HTTP API; existing `api`, `ApiError` from `@/lib/api.js`; `SectionCard`, `Button`, `useQueryClient` already imported in `Settings.tsx`.
- Produces: `useCloudSnapshots(enabled: boolean)` hook returning `CloudSnapshotInfo | null`.

(No web vitest — web tests are markdown-bridge fidelity only, per project rules. Verification is typecheck + the Task 7 live check.)

- [ ] **Step 1: Add the hook**

In `web/src/hooks/queries.ts`, add to `keys`: `cloudSnapshots: ['cloud', 'snapshots'] as const,` — then below `useCloudBilling`:

```ts
export interface CloudSnapshotInfo {
  snapshots: { id: string; time: string }[];
  restore: {
    state: 'queued' | 'restoring' | 'staged' | 'failed' | 'done';
    snapshotId: string;
    requestedTs: number;
    updatedTs: number;
    message?: string;
  } | null;
}

const RESTORE_PENDING = ['queued', 'restoring', 'staged'];

/** Hosted reefs only; polls while a restore is in flight so the card live-updates. */
export function useCloudSnapshots(enabled: boolean) {
  return useQuery({
    queryKey: keys.cloudSnapshots,
    queryFn: async () => {
      try {
        return await api<CloudSnapshotInfo>('GET', '/api/v1/cloud/snapshots');
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
        throw error;
      }
    },
    enabled,
    refetchInterval: (query) => {
      const restore = query.state.data?.restore;
      return restore && RESTORE_PENDING.includes(restore.state) ? 5_000 : false;
    },
    retry: false,
  });
}
```

- [ ] **Step 2: Add the card to `BackupsSection`'s cloud branch**

In `web/src/pages/Settings.tsx`, import `useCloudSnapshots` (extend the existing `@/hooks/queries.js` import) and add this component near `BackupsSection`:

```tsx
function CloudSnapshotsCard() {
  const { data } = useCloudSnapshots(true);
  const queryClient = useQueryClient();
  const [requestError, setRequestError] = useState<string | null>(null);
  if (!data || (data.snapshots.length === 0 && !data.restore)) return null;

  const restore = data.restore;
  const pending = restore != null && ['queued', 'restoring', 'staged'].includes(restore.state);
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });

  const requestRestore = async (id: string, time: string) => {
    const ok = window.confirm(
      `Take your reef back to the morning of ${day(time)}?\n\nEverything written since then swims away. We keep the current state as a safety copy on the server.`,
    );
    if (!ok) return;
    setRequestError(null);
    try {
      await api('POST', '/api/v1/cloud/snapshots/restore', { snapshotId: id });
      await queryClient.invalidateQueries({ queryKey: keys.cloudSnapshots });
    } catch (error) {
      setRequestError(error instanceof ApiError ? error.message : 'Could not start the restore');
    }
  };

  return (
    <SectionCard title="Go back to an earlier day">
      <p className="text-sm text-muted-foreground">
        Pick a nightly snapshot and your whole reef — memos, members, files — returns to
        how it was that morning. 🕰️🐠
      </p>
      {pending ? (
        <p className="mt-3 text-sm font-semibold text-ocean">
          Restoring your reef to {day(data.snapshots.find((s) => s.id === restore.snapshotId)?.time ?? '')} — this
          takes a few minutes. Just keep swimming; this page updates itself.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {data.snapshots.map((snapshot) => (
            <li key={snapshot.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{day(snapshot.time)}</span>
              <Button size="sm" variant="outline" onClick={() => void requestRestore(snapshot.id, snapshot.time)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      {restore?.state === 'done' && !pending ? (
        <p className="mt-2 text-xs font-semibold text-ocean">
          Restore complete — your reef is back to {day(data.snapshots.find((s) => s.id === restore.snapshotId)?.time ?? '')}. 🎉
        </p>
      ) : null}
      {restore?.state === 'failed' ? (
        <p className="mt-2 text-xs font-semibold text-destructive">{restore.message ?? 'The restore failed — nothing was changed.'}</p>
      ) : null}
      {requestError ? <p className="mt-2 text-xs font-semibold text-destructive">{requestError}</p> : null}
    </SectionCard>
  );
}
```

Then in the `isCloud` branch of `BackupsSection` (currently a single `<SectionCard title="Backups">…</SectionCard>`), wrap the return in a fragment and render the card after it, and soften the "reach out to roll back" paragraph:

```tsx
    return (
      <div className="flex flex-col gap-4">
        <SectionCard title="Backups">
          {/* existing content, but change the "Need to roll back…" paragraph to: */}
          <p className="mt-2 text-sm text-muted-foreground">
            Need to roll back? Pick a day below — or{' '}
            <a href="https://github.com/DavidAllmon/nemomemo/discussions" target="_blank" rel="noreferrer" className="text-ocean underline">
              reach out
            </a>{' '}
            and we&apos;ll help.
          </p>
          {/* rest of existing card unchanged */}
        </SectionCard>
        <CloudSnapshotsCard />
      </div>
    );
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: green. Also `pnpm --filter @nemomemo/web test` (bridge tests untouched, still 27).

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/queries.ts web/src/pages/Settings.tsx
git commit -m "web: snapshot browser + one-click rollback card in cloud Backups"
```

---

### Task 6: Docs (public-docs rule — same release)

**Files:**
- Modify: `site/content/docs/cloud.mdx` (self-serve rollback story)
- Modify: `docs/CLOUD-OPS.md` (worker, files, failure playbook)

- [ ] **Step 1: cloud.mdx**

In the backups/"we run it" area of `site/content/docs/cloud.mdx`, replace the sentence that says rollbacks go through support ("Need to roll back to an earlier day? Reach out…" — find the current phrasing and update it) with:

```mdx
Need to roll back to an earlier day? You can do it yourself: **Settings → Backups →
Go back to an earlier day** lists every nightly snapshot of your reef — pick a date,
confirm, and a few minutes later your reef is back to that morning (we keep the
pre-restore state as a safety copy on the server). If anything looks off, reach out
and we'll help.
```

- [ ] **Step 2: CLOUD-OPS.md**

Add a section after the backups material:

```md
## Snapshot browser / self-serve rollback

The app lists nightly snapshots from `snapshots.json` in the cloud volume (written by
`backup-cloud.sh`; run `deploy/backfill-snapshot-manifest.sh` once to fill history).
Restores are a file-queue handshake in `<volume>/restore/`:
`queue/<slug>.json` (app) → `restore-cloud.sh` cron (host, every minute, logs to
`/opt/nemomemo-deploy/restore.log`) restic-restores + integrity-checks into
`staged/<slug>/` → the app's 10 s sweeper evicts the reef, keeps one
`reefs/<slug>.pre-restore-<ts>` safety copy, and swaps the restore in.
`status/<slug>.json` carries the state machine (queued → restoring → staged → done,
or failed with a message). Restic creds stay in `backup.env`, host-only.

Troubleshooting: a request stuck in `restoring` for >15 min → check `restore.log`;
a crashed worker leaves `queue/<slug>.json.working`, which the next cron run
requeues automatically. To undo a restore: the safety copy is
`reefs/<slug>.pre-restore-<ts>` — stop nothing, just move it to
`restore/staged/<slug>` and the sweeper swaps it back in.
```

- [ ] **Step 3: Commit**

```bash
git add site/content/docs/cloud.mdx docs/CLOUD-OPS.md
git commit -m "docs: self-serve snapshot rollback (cloud.mdx + ops runbook)"
```

---

### Task 7: Release, deploy, VM rollout + drill

**Files:**
- Create: `docs/changelog/v1.12.0.md` (scaffolded by the release script)

- [ ] **Step 1: Full gate**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: everything green (shared 27 / server 120+ / web 27).

- [ ] **Step 2: Release (two-run flow)**

Run: `pnpm release minor` (scaffolds `docs/changelog/v1.12.0.md`), then fill BOTH sections — What's new (plain language, e.g. "**Your reef has a time machine.** Cloud reefs can now roll themselves back to any nightly snapshot from Settings → Backups — pick a day, confirm, done. We keep a safety copy of the present, just in case. 🕰️🐠") and Technical notes (snapshot API, sweeper, host worker, manifest; note the backup script's stage-path change re-reads all data once). Then commit the feature work, run `pnpm release minor` again, and `git push --follow-tags origin main`.

- [ ] **Step 3: Watch the deploy**

Poll `https://demo.trynemomemo.com/api/v1/instance/profile` (background loop, 20 s interval) until `version` is `1.12.0`. Confirm the demo still works (the feature ships dark there — nothing cloud-visible on a self-host instance; spot-check that Settings → Backups renders unchanged).

- [ ] **Step 4: VM rollout (operator — requires being on the home LAN with SSH to the VM; see the private infra memory for access)**

```bash
# on the VM, after the auto-deploy has pulled the new main:
bash /opt/nemomemo/deploy/cloud-vm-setup.sh          # installs jq + restore cron
bash /opt/nemomemo/deploy/backfill-snapshot-manifest.sh
docker exec <cloud-container> ls /app/data/snapshots.json   # manifest visible to the app
```

- [ ] **Step 5: Restore drill (operator, before telling anyone)**

On a canary/test reef (NOT a customer reef): open its Settings → Backups, restore to yesterday's snapshot, watch `restore.log` and the UI progress, verify the reef's memos match yesterday and the safety copy `reefs/<slug>.pre-restore-*` exists. Then restore the safety copy back (move it to `restore/staged/<slug>` per the ops runbook) and verify the reef returns to the present. Only after this drill passes is the feature considered shipped.

- [ ] **Step 6: Update the handoff memory**

Mark P1 fully complete in the `cloud-execution-handoff` memory (both items shipped), noting the drill result.

---

## Self-review notes (done at plan-writing time)

- **Spec coverage:** manifest (T1/T4), browse+request API (T2), host worker (T4), sweeper (T3), UI (T5), docs (T6), backfill + drill (T4/T7). Suspended reefs can't reach the routes (the suspended branch returns before the snapshot intercept) — matches the spec's "restore requires an active reefkeeper session".
- **Type consistency:** `RestoreStatus` field names (`state`, `snapshotId`, `requestedTs`, `requestedBy`, `updatedTs`, `message`) are identical in `snapshots.ts`, `restore-cloud.sh`'s `set_status` merge, and the web `CloudSnapshotInfo`. `makeCloudApp(registry, fleet, settings, dataDir, billing?)` is used consistently in T2's three call sites.
- **Known judgment calls for executors:** the exact `registry.createReef` call and the `cloud-billing.test.ts` context variable must be read from those files (flagged inline); restic `--include "*/reefs/<slug>"` glob behavior is validated by the T7 drill before announcement.
