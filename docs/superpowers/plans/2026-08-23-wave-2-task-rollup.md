# Task Rollup View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/tasks` page aggregating every unchecked `[ ]` across the viewer's memos, checkable in place — plus the committed code-health riders: SQL `json_each` aggregation for tags/stats (kills the 10k cap, audit #2) and deleting dead `toggleTask` (audit #6).

**Architecture:** `extractProps` in shared gains an `incompleteTasks` count in `property`; payload composition moves to shared (`buildMemoPayload`) so a new boot-time backfill in `createDb` (payload is JSON derived by JS — a .sql migration can't rewrite it) and `memo-service.buildPayload` share one source of truth. `listMemoRows`'s WHERE construction is extracted into `buildMemoListWhere` so the rewritten `/-/tags` and `/:username/stats` SQL aggregations inherit the Dory/bottle/comment guards by construction. The web page is a new lazy route that lists own memos with the existing `has_incomplete_tasks` filter and renders each memo's unchecked tasks via shared `listTaskItems`, toggling through `toggleTaskAt` + the normal PATCH path.

**Tech Stack:** remark AST walk (shared), better-sqlite3 `json_each`/`json_extract`, TanStack infinite query, lazy React route (split shipped in v1.16.1).

**Spec:** `docs/ROADMAP.md` § Wave 2 (task rollup row) + `docs/AUDIT-2026-08-22.md` items #2/#6 + cloud-execution-handoff memory.

## Global Constraints

- Green only before push: `pnpm typecheck && pnpm test && pnpm build`. Release: **v1.17.0** via `pnpm release minor`, both changelog sections, `git push --follow-tags`.
- `memo.payload` is derived — the extraction change REQUIRES a backfill (GOTCHAS). Implemented as an idempotent boot backfill inside `createDb` (runs for tenant reefs in cloud too, since they open through `createDb`); rehearse against a pre-change seeded DB.
- Payload rewrites must NOT touch `memo.content` (the FTS trigger fires on `UPDATE OF content`; a payload-only UPDATE leaves the index alone — that's correct).
- Both time guards + comment exclusion on every new memo query — inherited via `buildMemoListWhere`, with a regression test on the stats aggregation.
- No self-hoster config changes ⇒ no `site/content/docs/` update required.
- Web page copy in reef voice; interactive checkboxes splice the source (`toggleTaskAt`), never re-serialize.
- `MemoPropertyDto` gains optional `incompleteTasks?: number`; `UserStatsDto` gains `openTaskCount: number` — additive, nothing existing changes shape.

---

### Task 1: shared — incomplete-task count + buildMemoPayload; delete dead toggleTask

**Files:**
- Modify: `shared/src/markdown/extract.ts` (count in extractProps; new `buildMemoPayload`; delete `toggleTask`)
- Modify: `shared/src/markdown/extract.test.ts` (new tests; delete `toggleTask` tests)
- Modify: shared DTO types where `MemoPropertyDto` is declared (add `incompleteTasks?: number`)
- Modify: `server/src/services/memo-service.ts` (`buildPayload` delegates to shared)

**Interfaces:**
- Produces: `extractProps(content).property.incompleteTasks: number`; `buildMemoPayload(content): { payload: string; mentions: string[] }` exported from shared's index; `MemoPropertyDto.incompleteTasks?: number`.

- [ ] **Step 1: Write failing tests** in `extract.test.ts`:

```ts
it('counts incomplete tasks', () => {
  const { property } = extractProps('- [ ] one\n- [x] done\n- [ ] two');
  expect(property.incompleteTasks).toBe(2);
  expect(property.hasIncompleteTasks).toBe(true);
  expect(extractProps('- [x] done').property.incompleteTasks).toBe(0);
  expect(extractProps('plain text').property.incompleteTasks).toBe(0);
});

it('buildMemoPayload serializes tags + property and returns mentions', () => {
  const { payload, mentions } = buildMemoPayload('#reef hi @marlin\n- [ ] task');
  const parsed = JSON.parse(payload);
  expect(parsed.tags).toEqual(['reef']);
  expect(parsed.property.incompleteTasks).toBe(1);
  expect(mentions).toEqual(['marlin']);
});
```

Also delete the `toggleTask` tests (audit #6).

- [ ] **Step 2: Run** `pnpm --filter @nemomemo/shared exec vitest run src/markdown/extract.test.ts` — expect FAIL.

- [ ] **Step 3: Implement.** In `extractProps`: replace `hasIncompleteTasks` boolean tracking with `let incompleteTasks = 0`, increment on `item.checked === false`, return `property: { hasLink, hasCode, hasTaskList, hasIncompleteTasks: incompleteTasks > 0, incompleteTasks }` (extend `MemoProperty`). Add:

```ts
/** Compose the derived memo payload JSON (the shape SQL queries via json_extract). */
export function buildMemoPayload(content: string): { payload: string; mentions: string[] } {
  const extracted = extractProps(content);
  return {
    payload: JSON.stringify({ tags: extracted.tags, property: extracted.property }),
    mentions: extracted.mentions,
  };
}
```

Delete `toggleTask`. Export `buildMemoPayload` from shared's index barrel. Add `incompleteTasks?: number` to `MemoPropertyDto`. In `memo-service.ts`, `buildPayload` becomes a re-export/delegate of `buildMemoPayload` (keep the existing name so routes don't churn). In `buildMemoDtos`, map `incompleteTasks: payload.property?.incompleteTasks ?? 0` into the DTO property.

- [ ] **Step 4: Run shared + server + web suites** — all green (`pnpm test`). `toggleTask` had no non-test callers (verified 2026-08-23).

- [ ] **Step 5: Commit** `feat(shared): count incomplete tasks in payload; buildMemoPayload single source; drop dead toggleTask`

---

### Task 2: server — boot backfill for stale payloads

**Files:**
- Create: `server/src/db/backfill.ts`
- Modify: `server/src/db/index.ts` (call in `createDb` after `runMigrations`)
- Test: `server/src/test/payload-backfill.test.ts`

**Interfaces:**
- Produces: `backfillPayloads(sqlite: Database.Database): number` — rewrites `memo.payload` for rows missing `$.property.incompleteTasks`, returns rows rewritten; called on every boot (idempotent, cheap when nothing to do).

- [ ] **Step 1: Failing test** (`payload-backfill.test.ts`): open a temp FILE db via `createDb`, insert a memo row with an old-shape payload directly (`INSERT INTO memo (uid, creator_id, content, payload) VALUES ('old', 1, '- [ ] a\n- [ ] b', json('{"tags":[],"property":{"hasLink":false,"hasCode":false,"hasTaskList":true,"hasIncompleteTasks":true}}'))` after creating a user), close the underlying sqlite handle, reopen the same file via `createDb`, and assert `json_extract(payload,'$.property.incompleteTasks') = 2` and content unchanged.

- [ ] **Step 2: Run** — FAIL (payload still old shape after reopen).

- [ ] **Step 3: Implement** `backfill.ts`:

```ts
import type Database from 'better-sqlite3';
import { buildMemoPayload } from '@nemomemo/shared';

/**
 * memo.payload is derived; when extraction gains fields, older rows are stale
 * until rewritten. Runs at boot, rewrites only rows missing the newest field,
 * never touches content (so the FTS triggers stay quiet).
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
```

Call `backfillPayloads(sqlite)` in `createDb` right after `runMigrations(sqlite)`.

- [ ] **Step 4: Run full server suite** — green (fresh test DBs have no stale rows; the new test exercises the rewrite).

- [ ] **Step 5: Rehearsal** (rule 9): extend the scratchpad pattern — seed a pre-change DB (payloads without the count, some rows with code blocks/diacritics), reopen via `createDb`, assert every payload has the count and FTS still matches (backfill didn't disturb `memo_fts`).

- [ ] **Step 6: Commit** `feat(server): boot backfill rewrites stale payloads (incomplete-task count)`

---

### Task 3: server — SQL json_each aggregation for /-/tags + /:username/stats (audit #2)

**Files:**
- Modify: `server/src/services/memo-service.ts` (extract `buildMemoListWhere`; new `aggregateTagCounts`, `aggregateUserStats`)
- Modify: `server/src/routes/users.ts` (both routes use the new functions; delete `STATS_MEMO_CAP`)
- Modify: shared `UserStatsDto` (add `openTaskCount: number`)
- Test: `server/src/test/stats.test.ts` (new)

**Interfaces:**
- Produces: `buildMemoListWhere(db, opts): { where: string[]; params: unknown[] } | null` (null = caller returns empty; same semantics as today's inline logic — Dory guard, bottle guard, comment exclusion, state, scope/visibility); `aggregateTagCounts(db, viewer): Record<string, number>`; `aggregateUserStats(db, opts): UserStatsDto`.
- `listMemoRows` consumes `buildMemoListWhere` — behavior identical (existing suites are the regression net).

- [ ] **Step 1: Failing tests** (`stats.test.ts`):
  - tags: two memos `#reef/coral` + `#reef` → `/-/tags` returns `{ reef: 2, 'reef/coral': 1 }`.
  - stats: seed memos with link/code/tasks/pinned; assert every `UserStatsDto` field including new `openTaskCount` (e.g. one memo `- [ ] a\n- [ ] b`, another `- [ ] c` → `openTaskCount: 3`, `incompleteTaskCount: 2`).
  - guards: expired-dory memo's tag (rewind `forget_at`) and a pending bottle's tag appear in NEITHER tags NOR stats; a comment's tag never counts.
  - visibility: another viewer sees only PUBLIC/PROTECTED counts on `/:username/stats`.

- [ ] **Step 2: Run** — new-field assertions FAIL (`openTaskCount` undefined); guard tests should pass pre-refactor (armor).

- [ ] **Step 3: Implement.** Extract the WHERE-building block of `listMemoRows` (guards → comments → state → scope/visibility) into `buildMemoListWhere` and reuse it in `listMemoRows`. Then:

```ts
export function aggregateTagCounts(db: Db, viewer: UserRow): Record<string, number> {
  const built = buildMemoListWhere(db, { viewer, allowAnonymous: false, state: 'NORMAL', scope: 'home' });
  if (!built) return {};
  const sql = `SELECT je.value AS tag, count(*) AS n
    FROM memo, json_each(memo.payload, '$.tags') AS je
    WHERE ${built.where.join(' AND ')} GROUP BY je.value`;
  const rows = db.$client.prepare(sql).all(...(built.params as never[])) as { tag: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.tag, r.n]));
}
```

`aggregateUserStats` runs two statements over the same WHERE: (a) one aggregate row — `count(*)`, `SUM(COALESCE(json_extract(payload,'$.property.hasLink'),0))` etc. for link/code/task/incomplete booleans, `SUM(pinned)`, `SUM(COALESCE(json_extract(payload,'$.property.incompleteTasks'),0))` as openTaskCount; (b) `SELECT created_ts` for `memoCreatedTimestamps` (integers only — no 10k cap, no payload parsing). Tag counts via `aggregateTagCounts`-style query with the caller's scope options. Routes shrink to auth/user resolution + one call. Delete `STATS_MEMO_CAP`.

- [ ] **Step 4: Full server suite green** (tags rename tests, profile tests, memos tests are the net proving `buildMemoListWhere` extraction changed nothing).

- [ ] **Step 5: Commit** `perf(server): tags/stats aggregate in SQL via json_each — 10k cap removed (audit #2)`

---

### Task 4: web — /tasks page

**Files:**
- Create: `web/src/pages/Tasks.tsx`
- Modify: `web/src/App.tsx` (lazy route `/tasks` inside AppShell, RequireAuth)
- Modify: `web/src/components/layout/ViewsList.tsx` (the built-in "Open tasks" entry links to `/tasks` instead of the home-feed filter view)

**Interfaces:**
- Consumes: `useMemoList({ scope: 'home', filter: 'has_incomplete_tasks' })`, `useUpdateMemo`, shared `listTaskItems`/`toggleTaskAt`, `MemoDto.property.incompleteTasks`.

- [ ] **Step 1: Implement the page.** Structure (follow DoryMemory.tsx page conventions for header/empty states):
  - Header: `Open tasks` + total count (sum of `listTaskItems(...).filter(t => !t.checked).length` over loaded pages).
  - One card per memo (border/card tokens like MemoCard): creator-less compact header — relative time linking to `/memos/:uid`, then each unchecked task as a row: real `<input type="checkbox">` + task label. Label = the text of the task line: `content.slice(afterMarker, endOfLine)` cleaned of leading `] `; render as plain text (no markdown pipeline — rollup rows are glanceable, the memo link has the full rendering).
  - Toggle handler: `update.mutate({ uid, content: toggleTaskAt(memo.content, item.markerOffset, true) })`. Optimistic enough via query invalidation (useUpdateMemo already updates cache); a checked task leaves the list on refetch — that's the desired "done ✓ gone" behavior.
  - Checked-state guard: disable checkboxes while `update.isPending` for that memo (offsets go stale if two splices race on one memo).
  - Pagination: `hasNextPage` → "Load more" button like MemoFeed.
  - Empty state: reef voice — heading `All clear!`, body `No open tasks anywhere in your reef. Just keep swimming 🫧`.
- [ ] **Step 2: Wire the route** in App.tsx (lazy, RequireAuth, inside AppShell) and repoint the ViewsList built-in entry: `Open tasks` becomes a `<Link to="/tasks">` (keep `BUILT_IN_TASKS_VIEW` export if other code references it — check; if only ViewsList uses it, delete it).
- [ ] **Step 3: Verify** `pnpm typecheck && pnpm --filter @nemomemo/web test` green; `pnpm --filter @nemomemo/web run build` — /tasks is its own small chunk.
- [ ] **Step 4: Commit** `feat(web): /tasks — every open task across the reef, checkable in place`

---

### Task 5: verify, smoke, release v1.17.0

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **Step 2: Browser smoke** (dev servers + chrome-devtools MCP): create memos with mixed tasks; open `/tasks` from the sidebar entry; check a task → row disappears, memo content on Home shows `[x]`; empty the list → reef-voiced empty state; confirm stats/tags still render (Profile page heatmap + sidebar tag tree).
- [ ] **Step 3:** `pnpm release minor` twice with both changelog sections (What's new: "See every unfinished to-do from all your memos in one place — and check them off right there"; Technical: payload `incompleteTasks` + boot backfill, SQL json_each aggregation removing the 10k cap, `openTaskCount` in stats, dead `toggleTask` removed). `git push --follow-tags`.
- [ ] **Step 4:** Watch demo until 1.17.0, live-verify /tasks on demo (seeded content has `- [ ]` items — "Things I keep forgetting" memo), update handoff memory (item 2 + riders #2/#6 done; next: attachment gallery).

## Self-review notes

- Payload change ⇒ backfill: boot backfill (JS-derived JSON can't be rewritten by a .sql migration); rehearsed; FTS untouched by payload-only updates.
- Guards on new aggregation queries: inherited via `buildMemoListWhere` + explicit leak tests.
- Comments with tasks are excluded from /tasks (feed semantics — comment exclusion is part of the shared WHERE).
- DTO changes additive only; filter grammar untouched (`has_incomplete_tasks` still compiles against the boolean).
