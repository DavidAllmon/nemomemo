# Memo Edit History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every content edit keeps the words it replaced — browsable, diffable, one-click restorable from the memo ⋯ menu — pruned to the last 20 revisions / 90 days by the scheduler.

**Architecture:** New `memo_revision` table (FK cascade off `memo`). The PATCH content path writes the *prior* content as a revision inside the same transaction as the update. Read/restore routes are **creator-only AND gated by `checkMemoRead`** on the memo, so trash, Dory expiry, and pending bottles can never leak old text. Pruning is the **6th pass of the one scheduler tick**. Web gets a History dialog (list → line diff → restore) behind the ⋯ menu.

**Tech Stack:** Hono + better-sqlite3 (hand-rolled migration 0009), zod DTOs in shared, React dialog + hand-rolled LCS line diff (no new deps).

**Spec:** `docs/ROADMAP.md` § Wave 3 "Memo edit history" + `memory/cloud-execution-handoff.md` mission notes.

## Global Constraints

- Push to main = production in ~4 min; only push `pnpm typecheck && pnpm test && pnpm build` green.
- App-code push requires `pnpm release minor` (two-run flow, BOTH changelog sections) + `git push --follow-tags`.
- Migrations: new numbered `.sql` + matching `db/schema.ts` edit; never touch shipped ones; rehearse against a seeded pre-migration DB (0008 pattern).
- New time-based work goes in the scheduler tick — never a new interval.
- All memo exposure routes through `acl.ts`; extend `trash.test.ts`'s read-path matrix for any new surface.
- Reef voice for user copy: what happened, what to do next, then the fish.
- TDD server-first; web vitest only for pure lib logic (the diff), never React rendering.

---

### Task 1: Shared constants + DTOs

**Files:**
- Modify: `shared/src/constants.ts` (after `TRASH_RETENTION_SECONDS`)
- Modify: `shared/src/schemas/index.ts` (DTO section)

**Interfaces:**
- Produces: `REVISION_KEEP_COUNT = 20`, `REVISION_RETENTION_SECONDS = 90 * 86_400`, `interface MemoRevisionDto { id: number; content: string; createdTs: number }`, `interface MemoHistoryResponse { revisions: MemoRevisionDto[] }`.

- [ ] Add to `constants.ts`:

```ts
/** Edit history: how many revisions each memo keeps, and for how long. */
export const REVISION_KEEP_COUNT = 20;
export const REVISION_RETENTION_SECONDS = 90 * 86_400;
```

- [ ] Add to `schemas/index.ts` (near `ShareDto`):

```ts
export interface MemoRevisionDto {
  id: number;
  content: string;
  /** When this content was replaced by an edit (epoch seconds). */
  createdTs: number;
}

export interface MemoHistoryResponse {
  revisions: MemoRevisionDto[];
}
```

- [ ] `pnpm typecheck` → green. Commit `feat(shared): revision constants + history DTOs`.

### Task 2: Migration 0009 + schema.ts + rehearsal

**Files:**
- Create: `server/src/db/migrations/0009_memo_revisions.sql`
- Modify: `server/src/db/schema.ts`

**Interfaces:**
- Produces: table `memo_revision(id, memo_id FK cascade, content, created_ts)`, drizzle `memoRevisions`.

- [ ] Migration:

```sql
-- Edit history: every content edit stores the words it replaced.
-- FK cascade means purging a memo (purgeMemos, user delete) takes its
-- revisions with it — foreign_keys=ON is set in createDb.
CREATE TABLE memo_revision (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memo_id INTEGER NOT NULL REFERENCES memo(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_ts BIGINT NOT NULL
);

-- History reads newest-first per memo; the prune scans the same shape.
CREATE INDEX idx_memo_revision_memo ON memo_revision(memo_id, created_ts);
```

- [ ] `schema.ts`:

```ts
export const memoRevisions = sqliteTable('memo_revision', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  memoId: integer('memo_id')
    .notNull()
    .references(() => memos.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdTs: integer('created_ts').notNull().$defaultFn(now),
});
```

- [ ] Rehearse (scratchpad script, 0008 pattern): apply 0001–0008 by hand, seed a user + memo, boot `createDb`, assert `memo_revision` table + index exist, seeded rows intact, second boot is a no-op.
- [ ] Commit `feat(server): memo_revision table (migration 0009)`.

### Task 3: Revision service + capture on edit (TDD)

**Files:**
- Create: `server/src/services/revision-service.ts`
- Modify: `server/src/routes/memos.ts` (PATCH content branch)
- Test: `server/src/test/revisions.test.ts`

**Interfaces:**
- Produces: `captureRevision(db, memoId, content, now)`, `pruneRevisions(db, now): number`, `listRevisions(db, memoId): { id, content, created_ts }[]` (newest first, LIMIT REVISION_KEEP_COUNT).

- [ ] Failing tests: content edit writes one revision holding the PRIOR content; second edit → two revisions newest-first; same-content PATCH writes none; pin/visibility/archive PATCH writes none; permanent delete (`?permanent=1`) leaves zero `memo_revision` rows (FK cascade through `purgeMemos`).
- [ ] Implement `revision-service.ts`:

```ts
import { REVISION_KEEP_COUNT, REVISION_RETENTION_SECONDS } from '@nemomemo/shared';
import type { Db } from '../db/index.js';

export interface RevisionRow { id: number; content: string; created_ts: number }

/** Store the content an edit is about to replace. Call BEFORE the update, in its transaction. */
export function captureRevision(db: Db, memoId: number, content: string, now: number): void {
  db.$client
    .prepare('INSERT INTO memo_revision (memo_id, content, created_ts) VALUES (?, ?, ?)')
    .run(memoId, content, now);
}

export function listRevisions(db: Db, memoId: number): RevisionRow[] {
  return db.$client
    .prepare(
      'SELECT id, content, created_ts FROM memo_revision WHERE memo_id = ? ORDER BY created_ts DESC, id DESC LIMIT ?',
    )
    .all(memoId, REVISION_KEEP_COUNT) as RevisionRow[];
}

/** Scheduler pass: age out >90d, then keep only the newest 20 per memo. */
export function pruneRevisions(db: Db, now: number): number {
  const aged = db.$client
    .prepare('DELETE FROM memo_revision WHERE created_ts <= ?')
    .run(now - REVISION_RETENTION_SECONDS).changes;
  const over = db.$client
    .prepare(
      `DELETE FROM memo_revision WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY memo_id ORDER BY created_ts DESC, id DESC) AS rn
           FROM memo_revision
         ) WHERE rn > ?
       )`,
    )
    .run(REVISION_KEEP_COUNT).changes;
  return aged + over;
}
```

- [ ] PATCH route: wrap the content-changed update so revision + update commit together:

```ts
// in the content-changed branch, replacing the bare db.update():
const updated = ... // via transaction: captureRevision(db, memo.id, memo.content, now) then the update
```

Concretely: compute `patch` as today; when `patch.content != null`, run
`db.$client.transaction(() => { captureRevision(...); return db.update(memos).set(patch)... })()`;
otherwise keep the existing non-transactional update.

- [ ] Tests green. Commit `feat(server): capture a revision on every content edit`.

### Task 4: History + restore routes (TDD)

**Files:**
- Modify: `server/src/routes/memos.ts`
- Test: `server/src/test/revisions.test.ts`, `server/src/test/trash.test.ts` (matrix +1)

**Interfaces:**
- Produces: `GET /api/v1/memos/:uid/history` → `MemoHistoryResponse`; `POST /api/v1/memos/:uid/history/:revisionId/restore` → `{ memo: MemoDto }`.

Rules: creator-only (admin excluded — admins moderate, never read private drafts), and the memo must pass `checkMemoRead` (trash/Dory/bottle guards ride along). Restore = a normal edit: captures the current content as a new revision, rebuilds payload, bumps `updatedTs`; no mention notifications; restoring identical content is a no-op (no phantom revision); content-length check kept in case the instance limit shrank.

- [ ] Failing tests: history newest-first for the creator; 403 for another signed-in user on a PUBLIC memo; 401 signed-out; trashed memo → 404 for creator (and the same via the `trash.test.ts` matrix); expired-Dory memo → 404; restore swaps content + writes a revision of the pre-restore text + payload tags update (assert via memo DTO `tags`); restore by non-creator → 403; restore with a revision id belonging to a DIFFERENT memo → 404; no-op restore adds no revision.
- [ ] Implement (after the `/:uid/markdown` route; `/:uid/history` is parameterized so route order is safe):

```ts
// ---------- Edit history ----------
// Creator-only, and the memo itself must still be readable — so a trashed,
// expired, or otherwise hidden memo never leaks the words it used to hold.
const historyMemo = (c: Context<AppEnv>, uid: string): MemoRow => {
  const viewer = requireViewer(c);
  const memo = readableMemo(c, uid);
  if (memo.creatorId !== viewer.id) throw apiError('FORBIDDEN', 'Only the author can see this memo\'s past');
  return memo;
};

app.get('/:uid/history', (c) => {
  const memo = historyMemo(c, c.req.param('uid'));
  const response: MemoHistoryResponse = {
    revisions: listRevisions(db, memo.id).map((row) => ({
      id: row.id, content: row.content, createdTs: row.created_ts,
    })),
  };
  return c.json(response);
});

app.post('/:uid/history/:revisionId/restore', (c) => {
  const viewer = requireViewer(c);
  const memo = historyMemo(c, c.req.param('uid'));
  const revision = db.$client
    .prepare('SELECT id, content FROM memo_revision WHERE id = ? AND memo_id = ?')
    .get(Number(c.req.param('revisionId')), memo.id) as { id: number; content: string } | undefined;
  if (!revision) throw apiError('NOT_FOUND', 'That version drifted off — refresh the history and try again');
  if (revision.content === memo.content) {
    return c.json({ memo: buildMemoDtos(db, [memo], viewer)[0] });
  }
  const memoSetting = getInstanceMemoSetting(db);
  if (Buffer.byteLength(revision.content, 'utf8') > memoSetting.contentLengthLimit) {
    throw apiError('INVALID_ARGUMENT', 'Memo content is too long');
  }
  const now = nowSeconds();
  const { payload } = buildPayload(revision.content);
  const restore = db.$client.transaction(() => {
    captureRevision(db, memo.id, memo.content, now);
    return db
      .update(memos)
      .set({ content: revision.content, payload, updatedTs: now })
      .where(eq(memos.id, memo.id))
      .returning()
      .get();
  });
  return c.json({ memo: buildMemoDtos(db, [restore()], viewer)[0] });
});
```

- [ ] Tests green (full suite). Commit `feat(server): memo history + one-click restore routes`.

### Task 5: Scheduler pass 6 (TDD)

**Files:**
- Modify: `server/src/services/scheduler.ts`
- Test: `server/src/test/revisions.test.ts` (or `scheduler.test.ts` if it fits better)

- [ ] Failing tests: 25 revisions on one memo → tick leaves the 20 newest (assert oldest 5 gone); a revision older than 90 days on another memo → gone while its newer sibling stays; result reports `revisionsPruned`.
- [ ] Implement: add `revisionsPruned: number` to `SchedulerTickResult`; after the trash pass:

```ts
// 6) Edit history: age out old revisions, cap the pile per memo.
const revisionsPruned = pruneRevisions(db, now);
```

- [ ] Tests green. Commit `feat(server): prune edit history as the tick's sixth pass`.

### Task 6: Web line diff lib (TDD)

**Files:**
- Create: `web/src/lib/diff.ts`
- Test: `web/src/lib/diff.test.ts`

**Interfaces:**
- Produces: `type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }`, `diffLines(before: string, after: string): DiffLine[]` — LCS over lines; `added` = present only in `after`, `removed` = only in `before`.

- [ ] Tests: identical strings → all `same`; pure insertion; pure removal; replacement in the middle; empty `before`; empty `after`; trailing-newline stability.
- [ ] Implement classic LCS DP (content ≤ 8KB, line counts are tiny; O(n·m) is fine), then walk the table back to emit lines in order.
- [ ] `pnpm --filter @nemomemo/web exec vitest run src/lib/diff.test.ts` green. Commit `feat(web): line diff for the history dialog`.

### Task 7: History dialog + ⋯ menu entry

**Files:**
- Create: `web/src/components/memo/MemoHistoryDialog.tsx`
- Modify: `web/src/hooks/queries.ts` (add `keys.history(uid)`, `useMemoHistory(uid, enabled)`, `useRestoreRevision(uid)` — restore invalidates memos + history)
- Modify: `web/src/components/memo/MemoActionMenu.tsx` (item `History` with `History` lucide icon, shown for `isCreator`, opens the dialog)

Dialog behavior: fetch history when opened; list revisions newest-first ("Saved <local time>"); selecting one shows `diffLines(memo.content, revision.content)` — green = comes back if restored, red = what the current memo would drop, with a one-line legend; "Restore this version" button per selected revision (one-click, no confirm — the current text is captured as a revision first, so nothing is lost); empty state in reef voice: "No past versions yet. Edit this memo and the old words will wait here — just keep swimming."; footer note "Keeps the last 20 edits for 90 days."

- [ ] Implement hooks + dialog + menu item.
- [ ] `pnpm typecheck && pnpm test && pnpm build` green. Commit `feat(web): edit history dialog with diff + restore`.

### Task 8: Browser smoke (chrome-devtools MCP)

- [ ] `pnpm dev`, sign in locally, edit a memo twice, open ⋯ → History: two revisions, diff renders, restore brings old text back and the feed updates; check the dialog at a ~700px-tall viewport (app-shell scroll invariant).

### Task 9: Docs, release, live-verify

- [ ] Docs check: no new env vars/admin flows ⇒ `deploy.mdx`/`.env.example` untouched. If `site/content/docs` mentions Trash/"nothing is ever lost", add one line about edit history for parity; otherwise changelog only.
- [ ] `pnpm release minor` run 1 → fill `docs/changelog/v1.25.0.md` (What's new: plain-language "every edit keeps the old version…"; Technical notes: migration 0009, scheduler 6th pass, creator-only ACL) → run 2 → `git push --follow-tags`.
- [ ] Bg-poll `https://demo.trynemomemo.com/api/v1/instance/profile` until version = 1.25.0; live-verify the flow on demo (public playground — safe to create content).
- [ ] Update the handoff memory: Wave 3 item 2 shipped; next = tag management (regex dedupe first).
