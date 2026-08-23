# Cloud snapshot browser + one-click rollback — design

**Status: DRAFT — awaiting David's approval. Do not build until approved.**
Date: 2026-08-23 · Roadmap: P1 (L) · Prereq reading: `deploy/backup-cloud.sh`,
`server/src/cloud/`, `docs/CLOUD-OPS.md`

## The vision

A cloud reef's Settings → Backups tab lists every nightly snapshot; the reefkeeper
picks a date, confirms, and the reef is restored to that morning. No support email,
no SSH.

## Hard constraints (from the handoff; non-negotiable)

1. **Restic credentials never enter an app container.** `RESTIC_REPOSITORY` /
   `RESTIC_PASSWORD` live in `/opt/nemomemo-deploy/backup.env` on the VM host, full
   stop. The cloud container must be able to *browse* and *request*, never *decrypt*.
2. **Restore = fleet evict → replace `reefs/<slug>/` → reopen.** The `ReefFleet` LRU
   holds open better-sqlite3 handles; files must never be swapped under an open handle.
3. **Ship dark.** Nothing changes for self-hosters; `cloud-isolation.test.ts` is
   extended, not weakened.

## Verified reality (the handoff's CHECK item)

`backup-cloud.sh` takes **one restic snapshot per night** containing the whole staged
tree — `registry.db` + every `reefs/<slug>/` (consistent `.backup` sqlite copies +
hardlinked uploads). There are **no per-reef snapshots**. Per-reef restore is therefore
a *subtree* restore: `restic restore <id> --include <stage>/reefs/<slug>`.

Complication: the stage dir is `mktemp -d /tmp/nemomemo-backup.XXXXXX`, so every
snapshot's paths have a different random prefix. Restorable (with a wildcard include),
but ugly and it defeats restic's path-based parent detection. This design fixes it.

## Approaches considered

- **A. Host-side HTTP agent** (localhost daemon holding restic creds; container calls
  it over the docker gateway). Synchronous UX, but: a new always-on daemon, a
  container→host network path to secure, an auth story between the two, and a bigger
  attack surface — all for an operation that happens a few times a year.
- **B. File queue over the shared volume + host cron** *(recommended)*. The container
  and the host already share the cloud data volume; the VM already runs on cron
  (update.sh every 3 min, backup nightly, demo reset daily). Restores are rare and a
  "takes a few minutes" progress state is honest UX. Zero new network surface; creds
  stay purely host-side.
- **C. Manifest-only UI + "contact support" restore.** Half the vision; rejected.

**Chosen: B**, with a twist that keeps responsibilities clean: the **host does only the
restic part** (it has the creds), and the **app does only the swap part** (it owns the
fleet). Neither side ever needs to call the other — they talk exclusively through
files in the volume.

## Architecture

Four pieces, communicating only via files under the cloud data volume (`$DATA`):

```
nightly  backup-cloud.sh ──────────────► $DATA/snapshots.json           (manifest)
browse   GET  /api/v1/cloud/snapshots ◄─ reads manifest
request  POST /api/v1/cloud/snapshots/restore ──► $DATA/restore/queue/<slug>.json
restic   restore-cloud.sh (host cron, 1 min) ────► $DATA/restore/staged/<slug>/
                                                   (+ status file on progress/failure)
swap     restore-sweeper (in-app, cloud-only) ──► evict → swap dirs → status: done
status   GET /api/v1/cloud/snapshots/restore ◄── reads $DATA/restore/status/<slug>.json
```

### 1. Manifest — `backup-cloud.sh` additions

- Stage at a **fixed path** (`/tmp/nemomemo-backup-stage`, wiped first) instead of
  `mktemp`, so snapshot paths are stable across nights. (First run after the change
  re-chunks everything; restic dedup keeps the upload small. Old snapshots stay
  restorable via a wildcard include.)
- After `restic backup` + `forget`, write `$DATA/snapshots.json`:
  `[{ "id": "<short-id>", "time": "<ISO>", "reefs": ["slug", ...] }, ...]` — the reef
  list is simply the slugs staged that night, so the app can show each reefkeeper only
  the dates that actually contain *their* reef. A one-time backfill script
  (`restic ls` over the ~22 existing snapshots) seeds entries for history; run once
  during rollout.
- Manifest is written host-side by the backup script; the container only ever reads it.
  It contains ids, dates, and slugs — no secrets.

### 2. Browse + request — cloud router (`server/src/cloud/snapshots.ts`)

Extends the existing reefkeeper-gated surface in `handleReefCloudApi` (same auth: reef
resolved from Host header, session cookie must belong to an ADMIN of that reef —
cross-reef access is structurally impossible, same as billing):

- `GET /api/v1/cloud/snapshots` → manifest entries filtered to this reef's slug,
  newest first, plus the current restore status if any.
- `POST /api/v1/cloud/snapshots/restore` `{ snapshotId }` → validates the id is in the
  manifest and contains this reef, refuses if a restore is already pending, then writes
  `$DATA/restore/queue/<slug>.json` `{ slug, snapshotId, requestedTs, requestedBy }`
  and sets status `queued`. Responds 202.
- `GET` (same status object) is what the UI polls: `queued` → `restoring` → `staged` →
  `done` (with timestamps) or `failed` (with a human message).

### 3. Restic worker — `deploy/restore-cloud.sh` (host, cron every minute)

For each queue file (normally zero — the scan is a no-op costing nothing):
1. Move the queue file to a lock name (`.working`) so a slow restore can't double-run;
   set status `restoring`.
2. `restic restore <id> --target <tmp> --include '*/reefs/<slug>'` (wildcard covers
   old random-prefix snapshots and the new fixed path).
3. Integrity-gate the result: `sqlite3 …/nemomemo.db 'PRAGMA integrity_check'` must
   say `ok`, else status `failed`, nothing else happens (mirrors the self-host restore
   endpoint's refuse-and-change-nothing behavior).
4. Move the restored reef dir to `$DATA/restore/staged/<slug>/` and set status
   `staged`. The host's job ends here — it never touches `reefs/<slug>/` itself,
   because the app may hold that database open.

Installed by an idempotent addition to `deploy/cloud-vm-setup.sh` (cron line in
`/etc/cron.d/nemomemo-restore`, log to `/opt/nemomemo-deploy/restore.log`), same
pattern as the backup cron.

### 4. Swap — restore sweeper (in-app, cloud mode only)

A small interval (10 s, alongside the existing dory/reef sweeper patterns) watches
`$DATA/restore/staged/`. When `<slug>/` appears, in **one synchronous function** (no
awaits, so no request can interleave — better-sqlite3 is sync, the same property the
LRU eviction already relies on):
1. `fleet.evict(slug)` — closes the open handle if any.
2. `rename reefs/<slug>` → `reefs/<slug>.pre-restore-<ts>` (safety copy, matching the
   self-host restore convention; the previous `.pre-restore-*` for that slug is
   deleted so exactly one safety copy is kept).
3. `rename staged/<slug>` → `reefs/<slug>`.
4. Status → `done`. The next request re-opens the reef lazily via `fleet.get()` and
   boot migrations bring an older-schema database forward — the same path every reef
   already takes on cold open.

In-flight requests that grabbed a handle before eviction finish against the old inode
(harmless, then it's garbage). `.pre-restore-*` dirs can never collide with live reefs:
`REEF_SLUG_RE` forbids dots, and the registry — not the filesystem — defines which
reefs exist.

## UI (cloud Backups tab, `Settings.tsx`)

Below the existing "backed up automatically" card, a **"Go back to an earlier day"**
card: a list of snapshot dates (from `GET`), a pick → hard confirm dialog ("Your reef
will go back to how it was on the morning of **{date}**. Everything written since then
swims away. We keep the current state as a safety copy on the server."), then a
progress state driven by status polling ("Restoring your reef — this takes a few
minutes. 🐠") ending in a success banner or the failure message. While a restore is
pending the button is disabled everywhere (server enforces it too).

## Testing

- **Server (vitest, TDD):** snapshot route tests against a fixture manifest +
  fake data dir (list filtering by slug, refuse unknown snapshot id / snapshot without
  this reef / double restore; queue file contents; status echo). Sweeper tests: drop a
  staged dir, assert evict + dir swap + single safety copy + `done`; corrupt/missing
  cases. Cloud-isolation additions: non-admin member → 403; the routes don't exist
  single-tenant; reef A's manifest view never contains reef B's dates-only-for-B.
- **Host script:** shellcheck + a rehearsal on the VM against a scratch copy of the
  repo data (restore last night's snapshot of the canary/test reef into staging,
  verify integrity), then one full end-to-end drill on a throwaway paid-test reef
  before the feature is announced.
- Rule 9 applies: rehearse the whole flow before it's mentioned in user-facing docs.

## Out of scope (YAGNI)

Self-host snapshot browsing (self-hosters have the zip + restore button and their own
restic guide), partial/per-memo restore, on-demand (non-nightly) snapshots, retention
changes, and any host→container or container→host network channel.

## Docs to update in the same release (public-docs rule)

`site/content/docs/cloud.mdx` (the "we back you up" story gains the self-serve
rollback), `docs/CLOUD-OPS.md` (cron, files, failure playbook: a stuck `.working`
queue file, a `failed` status, manifest backfill).

## Open questions for David

1. **Async OK?** File-queue means "restore takes a few minutes" rather than instant.
   (Recommended: yes — it's the price of keeping creds fully off the containers.)
2. **Safety copies:** keep exactly one `.pre-restore-*` per reef (recommended), or
   more?
3. **Stage-path change:** first nightly after the fix re-reads all data (storage
   stays deduped). Fine to ship with this feature's release? (Recommended: yes.)
4. **Sweeper cadence** 10 s and **cron cadence** 1 min acceptable? (Both are no-op
   scans when idle.)
