# Wave 1 — The Time Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Wave 1 of the roadmap: a general minute-tick scheduler service plus per-memo forget windows, reminders, message-in-a-bottle (`surface_at`), the "Dory is about to forget…" notice, Dory's Memory page, Dory statistics, and recurring reminders.

**Architecture:** One migration (0005) adds `memo.remind_at`, `memo.remind_every`, `memo.surface_at`, `user.dory_forgotten_count`, and rebuilds `inbox` with three new notification types. A new `services/scheduler.ts` generalizes the dory sweeper into one minute-tick that (in order) surfaces bottles, fires reminders (+ optional email), emits expiry warnings, and sweeps forgotten memos while bumping per-user forgotten counters. Every feed query gains a `surface_at` guard mirroring the `forget_at` pattern; ACL treats a pending bottle as creator-only. The web adds a forget-window picker, reminder dialog, bottle date picker, a `/dory` page, and three new inbox renderings.

**Tech Stack:** Hono + Drizzle + better-sqlite3 (server), zod schemas + DTOs in shared, React 19 + TanStack Query v5 (web), vitest via `makeTestApp()`.

**Spec:** `docs/ROADMAP.md` § "Wave 1 — The time layer" (post-v1.13.0 edition).

## Global Constraints

- Push to main = production for paying customers in ~4 min. Push only after `pnpm typecheck && pnpm test && pnpm build` are green.
- App-code push requires `pnpm release minor` (two-run flow, BOTH changelog sections) + `git push --follow-tags`. This wave ships as **v1.14.0** in one release at the end; intermediate commits stay local.
- Migrations: new numbered `.sql` + matching `db/schema.ts` edit; never edit shipped migrations; rehearse against a seeded pre-migration DB before shipping (scratchpad script, apply 0001–0004 by hand then boot `createDb`).
- Every memo-reading query carries BOTH guards: `forget_at IS NULL OR forget_at > now` AND (new) `surface_at IS NULL OR surface_at <= now` for feed-type queries.
- All memo exposure routes through `services/acl.ts` — no inline visibility checks.
- Comments can't be Dory memos, can't be bottles. Pinned ⟂ dory, pinned ⟂ bottle; dory+bottle only if `forget_at > surface_at`. Archiving rescues (clears `forget_at`).
- Email: injected `Mailer`, `trySend` fire-and-forget; everything degrades silently when SMTP off.
- Route ordering: static routes (`/dory`, `/export/markdown`) registered before `/:uid`.
- Reef voice for user-facing copy; error = what happened, what to do, then the fish.
- Public docs (`site/content/docs/`) updated in the same release for user-visible features (dory.mdx, memos.mdx); no new env vars this wave.
- TDD for server work: failing test first, minimal implementation, green, commit.

---

### Task 1: Migration 0005 + schema.ts (the one schema change for the wave)

**Files:**
- Create: `server/src/db/migrations/0005_time_layer.sql`
- Modify: `server/src/db/schema.ts` (memos, users, inboxes tables + types)
- Test: rehearsal script in scratchpad (not committed)

**Interfaces:**
- Produces: `memos.remindAt: integer | null`, `memos.remindEvery: 'DAILY'|'WEEKLY'|'MONTHLY' | null`, `memos.surfaceAt: integer | null`, `users.doryForgottenCount: integer` (default 0), inbox `type` enum gains `'REMINDER' | 'BOTTLE_ARRIVED' | 'DORY_WARNING'`.

- [ ] **Step 1: Write the migration**

```sql
-- Wave 1, the time layer: reminders (remind_at [+ recurrence]), message in a
-- bottle (surface_at), and Dory's forgotten-memo counter. The inbox gains
-- three self-notification types; SQLite can't alter a CHECK, so rebuild (again).
ALTER TABLE memo ADD COLUMN remind_at INTEGER;
ALTER TABLE memo ADD COLUMN remind_every TEXT CHECK (remind_every IN ('DAILY','WEEKLY','MONTHLY'));
ALTER TABLE memo ADD COLUMN surface_at INTEGER;
ALTER TABLE user ADD COLUMN dory_forgotten_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_memo_remind_at ON memo(remind_at) WHERE remind_at IS NOT NULL;
CREATE INDEX idx_memo_surface_at ON memo(surface_at) WHERE surface_at IS NOT NULL;

CREATE TABLE inbox_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('UNREAD','READ','ARCHIVED')) DEFAULT 'UNREAD',
  type TEXT NOT NULL CHECK (type IN ('MEMO_COMMENT','MEMO_MENTION','MEMO_THREAD','REMINDER','BOTTLE_ARRIVED','DORY_WARNING')),
  memo_id INTEGER REFERENCES memo(id) ON DELETE CASCADE
);
INSERT INTO inbox_new (id, created_ts, sender_id, receiver_id, status, type, memo_id)
  SELECT id, created_ts, sender_id, receiver_id, status, type, memo_id FROM inbox;
DROP TABLE inbox;
ALTER TABLE inbox_new RENAME TO inbox;
CREATE INDEX idx_inbox_receiver ON inbox(receiver_id, status);
```

- [ ] **Step 2: Update `db/schema.ts`** — in `memos` add after `forgetAt`:

```ts
  remindAt: integer('remind_at'),
  remindEvery: text('remind_every', { enum: ['DAILY', 'WEEKLY', 'MONTHLY'] }),
  surfaceAt: integer('surface_at'),
```

In `users` add after `description`: `doryForgottenCount: integer('dory_forgotten_count').notNull().default(0),`
In `inboxes` extend the type enum: `['MEMO_COMMENT', 'MEMO_MENTION', 'MEMO_THREAD', 'REMINDER', 'BOTTLE_ARRIVED', 'DORY_WARNING']` (keep the "sync with CHECK" comment).

- [ ] **Step 3: Fix compile fallout** — `placeholderUser()` in `services/memo-service.ts` and any test fixture constructing a `UserRow` need `doryForgottenCount: 0`; `rawToMemoRow` gains the three fields (Task 3 does it properly — here just make `pnpm typecheck` pass by including them).

- [ ] **Step 4: Rehearse the migration** — scratchpad script: create a temp file DB, apply 0001–0004 by hand (read files, `exec`), insert a user + memo + inbox row, then run `createDb(path)` (applies 0005) and assert: columns exist, inbox row survived with same id/status, new-type insert (`REMINDER`) accepted, old-type CHECK still enforced.

- [ ] **Step 5: Run suite** — `pnpm typecheck && pnpm --filter @nemomemo/server test` → green (existing 137+ tests must not regress).

- [ ] **Step 6: Commit** — `feat: migration 0005 — time-layer columns + inbox types`

---

### Task 2: Shared constants, request schemas, DTOs

**Files:**
- Modify: `shared/src/constants.ts`, `shared/src/schemas/index.ts`

**Interfaces:**
- Produces: `DORY_WINDOWS = ['1h','24h','3d','7d']`, `DoryWindow`, `DORY_WINDOW_SECONDS: Record<DoryWindow, number>`, `REMIND_REPEATS = ['DAILY','WEEKLY','MONTHLY']`, `RemindRepeat`; `createMemoRequestSchema` + `doryWindow`, `surfaceAt`; `updateMemoRequestSchema` + `doryWindow`, `surfaceAt` (nullable), `remindAt` (nullable), `remindEvery` (nullable); `MemoDto` + `remindAt: number | null`, `remindEvery: RemindRepeat | null`, `surfaceAt: number | null`; `InboxDto['type']` union extended.

- [ ] **Step 1: constants.ts** — below `DORY_TTL_SECONDS`:

```ts
/** Per-memo forget windows for Dory memos ('24h' matches the classic default). */
export const DORY_WINDOWS = ['1h', '24h', '3d', '7d'] as const;
export type DoryWindow = (typeof DORY_WINDOWS)[number];
export const DORY_WINDOW_SECONDS: Record<DoryWindow, number> = {
  '1h': 3600,
  '24h': 24 * 3600,
  '3d': 3 * 24 * 3600,
  '7d': 7 * 24 * 3600,
};

/** Recurrence for reminders ("every Monday: water the plants"). */
export const REMIND_REPEATS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type RemindRepeat = (typeof REMIND_REPEATS)[number];
```

- [ ] **Step 2: schemas** — `createMemoRequestSchema` gains `doryWindow: z.enum(DORY_WINDOWS).optional()`, `surfaceAt: z.number().int().positive().optional()`. `updateMemoRequestSchema` gains `doryWindow: z.enum(DORY_WINDOWS).optional()`, `surfaceAt: z.number().int().positive().nullable().optional()`, `remindAt: z.number().int().positive().nullable().optional()`, `remindEvery: z.enum(REMIND_REPEATS).nullable().optional()`. `MemoDto` gains the three fields (non-optional). `InboxDto.type` becomes `'MEMO_COMMENT' | 'MEMO_MENTION' | 'MEMO_THREAD' | 'REMINDER' | 'BOTTLE_ARRIVED' | 'DORY_WARNING'`. Import `DORY_WINDOWS`, `REMIND_REPEATS` from constants.

- [ ] **Step 3: Run** — `pnpm typecheck` (server will fail until Task 3 adds DTO fields — do Tasks 2+3 in one commit if needed; otherwise stub DTO emission in `buildMemoDtos` now).

- [ ] **Step 4: Commit** — `feat(shared): time-layer schemas, dory windows, reminder repeats`

---

### Task 3: memo-service — time rules, surface guard, DTO fields

**Files:**
- Modify: `server/src/services/memo-service.ts`
- Test: `server/src/test/bottles.test.ts` (create), `server/src/test/dory.test.ts` (extend)

**Interfaces:**
- Consumes: schema fields from Task 1, constants from Task 2.
- Produces: `assertTimeRules(pinned: boolean, forgetAt: number | null, surfaceAt: number | null): void` (replaces `assertDoryRules` — update the one call site); `listMemoRows` hides pending bottles; `buildMemoDtos` emits `remindAt`/`remindEvery`/`surfaceAt`.

- [ ] **Step 1: Write failing tests** in `bottles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MemoDto } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

const future = (secs: number) => Math.floor(Date.now() / 1000) + secs;

describe('message in a bottle', () => {
  it('a pending bottle is hidden from the owner feed and explore', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'sender');
    await createMemo(app, cookie, { content: 'dear future me', visibility: 'PUBLIC', surfaceAt: future(3600) });
    const home = (await (await jsonRequest(app, 'GET', '/api/v1/memos?scope=home', undefined, cookie)).json()) as { memos: MemoDto[] };
    expect(home.memos).toHaveLength(0);
    const explore = (await (await jsonRequest(app, 'GET', '/api/v1/memos?scope=explore', undefined, cookie)).json()) as { memos: MemoDto[] };
    expect(explore.memos).toHaveLength(0);
  });

  it('rejects pinning a bottle, and a bottle that would be forgotten before it surfaces', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'sender');
    const bottle = await createMemo(app, cookie, { content: 'at sea', surfaceAt: future(3600) });
    expect((await jsonRequest(app, 'PATCH', `/api/v1/memos/${bottle.uid}`, { pinned: true }, cookie)).status).toBe(400);
    // dory (24h default) + surface in 3d ⇒ forget_at < surface_at ⇒ rejected
    const response = await jsonRequest(app, 'POST', '/api/v1/memos', { content: 'x', dory: true, surfaceAt: future(3 * 24 * 3600) }, cookie);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @nemomemo/server exec vitest run src/test/bottles.test.ts` — fails (surfaceAt ignored / memos visible).

- [ ] **Step 3: Implement** in memo-service:
  - `rawToMemoRow`: add `remindAt: (raw.remind_at as number | null) ?? null`, `remindEvery: (raw.remind_every as MemoRow['remindEvery']) ?? null`, `surfaceAt: (raw.surface_at as number | null) ?? null`.
  - `listMemoRows`: directly under the Dory guard add:

```ts
  // Bottles at sea: a memo with a future surface_at is hidden from every feed
  // (even the owner's — that's the point) until its day arrives.
  where.push('(memo.surface_at IS NULL OR memo.surface_at <= ?)');
  params.push(now);
```

  - Replace `assertDoryRules` with:

```ts
export function assertTimeRules(pinned: boolean, forgetAt: number | null, surfaceAt: number | null): void {
  if (pinned && forgetAt != null) {
    throw apiError('INVALID_ARGUMENT', "A memo can't be pinned and a Dory memo at once — Dory would forget something important!");
  }
  if (pinned && surfaceAt != null) {
    throw apiError('INVALID_ARGUMENT', "A memo can't be pinned while it's at sea — surface it first, then pin it.");
  }
  if (forgetAt != null && surfaceAt != null && forgetAt <= surfaceAt) {
    throw apiError('INVALID_ARGUMENT', "Dory would forget this bottle before it washes ashore — give it a longer forget window or an earlier surface date.");
  }
}
```

  - `buildMemoDtos` return object: add `remindAt: row.remindAt`, `remindEvery: row.remindEvery`, `surfaceAt: row.surfaceAt`.
  - Route changes to actually accept `surfaceAt` are Task 5 — for this task's tests to pass, Task 5's create-route change for `surfaceAt` is needed; implement Tasks 3+5 back-to-back, run bottles tests after Task 5.

- [ ] **Step 4: Commit** — `feat(server): time rules + surface_at feed guard + DTO fields`

---

### Task 4: ACL — pending bottles are creator-only

**Files:**
- Modify: `server/src/services/acl.ts`
- Test: extend `server/src/test/bottles.test.ts`

**Interfaces:**
- Produces: `checkMemoRead` / `canGlimpseMemo` deny non-creators for memos with `surfaceAt > now` (share tokens included — a bottle at sea is nobody's business yet; the creator may still open it from the bottles list).

- [ ] **Step 1: Failing tests** (bottles.test.ts):

```ts
  it('a pending bottle is readable by its creator, invisible to everyone else — even via share token', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'sender');
    const other = await signup(app, 'other');
    const bottle = await createMemo(app, cookie, { content: 'secret till Tuesday', visibility: 'PUBLIC', surfaceAt: future(3600) });
    expect((await jsonRequest(app, 'GET', `/api/v1/memos/${bottle.uid}`, undefined, cookie)).status).toBe(200);
    expect((await jsonRequest(app, 'GET', `/api/v1/memos/${bottle.uid}`, undefined, other)).status).toBe(404);
    const share = (await (await jsonRequest(app, 'POST', `/api/v1/memos/${bottle.uid}/shares`, { expiresIn: 'never' }, cookie)).json()) as { share: { token: string } };
    expect((await jsonRequest(app, 'GET', `/api/v1/shares/${share.share.token}`)).status).toBe(404);
  });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — in `checkMemoRead`, after the Dory block and BEFORE the share-token block:

```ts
  // A bottle at sea (future surface_at) is the creator's secret until its day
  // arrives — invisible to everyone else, share tokens included.
  if (
    (memo.surfaceAt != null && memo.surfaceAt > now) ||
    (effective.surfaceAt != null && effective.surfaceAt > now)
  ) {
    return viewer?.id === memo.creatorId ? null : 'NOT_FOUND';
  }
```

In `canGlimpseMemo`, after the Dory line: `if (memo.surfaceAt != null && memo.surfaceAt > now) return viewer?.id === memo.creatorId;`

- [ ] **Step 4: Run bottles + security + shares suites** — green.
- [ ] **Step 5: Commit** — `feat(server): pending bottles are creator-only in ACL`

---

### Task 5: Routes — dory windows, bottle fields, reminder fields

**Files:**
- Modify: `server/src/routes/memos.ts`
- Test: extend `server/src/test/dory.test.ts` + new `server/src/test/reminders.test.ts`

**Interfaces:**
- Consumes: `assertTimeRules`, `DORY_WINDOW_SECONDS`, new schema fields.
- Produces: POST `/memos` honors `doryWindow`/`surfaceAt`; PATCH `/memos/:uid` honors `doryWindow`, `surfaceAt` (null clears), `remindAt` (null clears), `remindEvery`.

- [ ] **Step 1: Failing tests** — dory.test.ts:

```ts
  it('honors a per-memo forget window', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const memo = (await createMemo(app, cookie, { content: 'week-long thought', dory: true, doryWindow: '7d' })) as unknown as MemoDto;
    expect(memo.forgetAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 6 * 24 * 3600);
  });
```

reminders.test.ts:

```ts
import { describe, expect, it } from 'vitest';
import type { MemoDto } from '@nemomemo/shared';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

const future = (secs: number) => Math.floor(Date.now() / 1000) + secs;

describe('reminders', () => {
  it('sets, repeats, and clears a reminder', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'water the plants' });
    const on = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindAt: future(3600), remindEvery: 'WEEKLY' }, cookie);
    const dto = ((await on.json()) as { memo: MemoDto }).memo;
    expect(dto.remindAt).not.toBeNull();
    expect(dto.remindEvery).toBe('WEEKLY');
    const off = await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindAt: null }, cookie);
    expect(((await off.json()) as { memo: MemoDto }).memo.remindAt).toBeNull();
  });

  it('rejects a reminder in the past and repeats without a reminder', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'x' });
    expect((await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindAt: 1000 }, cookie)).status).toBe(400);
    expect((await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindEvery: 'DAILY' }, cookie)).status).toBe(400);
  });

  it('only the creator can set a reminder', async () => {
    const { app } = makeTestApp();
    const admin = await signup(app, 'admin');
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'mine', visibility: 'PUBLIC' });
    expect((await jsonRequest(app, 'PATCH', `/api/v1/memos/${memo.uid}`, { remindAt: future(3600) }, admin)).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify failures.**

- [ ] **Step 3: Implement** in routes/memos.ts:
  - Import `DORY_WINDOW_SECONDS` from shared; swap `assertDoryRules` import for `assertTimeRules`.
  - Create route: `const forgetAt = body.dory ? now + (body.doryWindow ? DORY_WINDOW_SECONDS[body.doryWindow] : config.doryTtlSeconds) : null;` then before insert:

```ts
    const surfaceAt = body.surfaceAt ?? null;
    if (surfaceAt != null && surfaceAt <= now) {
      throw apiError('INVALID_ARGUMENT', 'A bottle needs a future date — pick a day that hasn\'t happened yet.');
    }
    assertTimeRules(false, forgetAt, surfaceAt);
```

  and add `surfaceAt` to the insert values.
  - PATCH route: extend the `editing` flag with `body.doryWindow != null || body.surfaceAt !== undefined || body.remindAt !== undefined || body.remindEvery !== undefined`. Then:

```ts
    if (body.dory != null) {
      if (getParentMemo(db, memo.id)) {
        throw apiError('INVALID_ARGUMENT', "Comments can't be Dory memos — they live and die with their parent");
      }
      patch.forgetAt = body.dory
        ? now + (body.doryWindow ? DORY_WINDOW_SECONDS[body.doryWindow] : config.doryTtlSeconds)
        : null;
    }
    if (body.surfaceAt !== undefined) {
      if (getParentMemo(db, memo.id)) {
        throw apiError('INVALID_ARGUMENT', "Comments can't be bottles — they live on their parent's shore");
      }
      if (body.surfaceAt != null && body.surfaceAt <= now) {
        throw apiError('INVALID_ARGUMENT', "A bottle needs a future date — pick a day that hasn't happened yet.");
      }
      patch.surfaceAt = body.surfaceAt;
    }
    if (body.remindAt !== undefined) {
      if (body.remindAt != null && body.remindAt <= now) {
        throw apiError('INVALID_ARGUMENT', "That moment already swam by — pick a future time for the nudge.");
      }
      patch.remindAt = body.remindAt;
      if (body.remindAt == null) patch.remindEvery = null;
    }
    if (body.remindEvery !== undefined) {
      const remindAt = body.remindAt !== undefined ? body.remindAt : memo.remindAt;
      if (body.remindEvery != null && remindAt == null) {
        throw apiError('INVALID_ARGUMENT', 'A repeat needs a first nudge — set a reminder time too.');
      }
      patch.remindEvery = body.remindEvery;
    }
```

  - Final rule check: `const nextSurfaceAt = 'surfaceAt' in patch ? (patch.surfaceAt ?? null) : memo.surfaceAt;` then `assertTimeRules(nextPinned, nextForgetAt, nextSurfaceAt);`

- [ ] **Step 4: Run dory/reminders/bottles suites + full server suite** — green.
- [ ] **Step 5: Commit** — `feat(server): dory windows, bottle + reminder fields on memo routes`

---

### Task 6: GET /api/v1/memos/dory — Dory's Memory data

**Files:**
- Modify: `server/src/routes/memos.ts` (register BEFORE `/:uid`, next to `/export/markdown`)
- Test: `server/src/test/dory.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/memos/dory` → `{ fading: MemoDto[], bottles: MemoDto[], forgottenCount: number }` (auth required; own memos only; fading sorted by `forget_at ASC`, bottles by `surface_at ASC`).

- [ ] **Step 1: Failing test** (dory.test.ts):

```ts
  it("Dory's Memory lists fading memos and bottles at sea", async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'dory');
    await createMemo(app, cookie, { content: 'fading soon', dory: true, doryWindow: '1h' });
    await createMemo(app, cookie, { content: 'fading later', dory: true, doryWindow: '7d' });
    await createMemo(app, cookie, { content: 'at sea', surfaceAt: Math.floor(Date.now() / 1000) + 3600 });
    const page = (await (await jsonRequest(app, 'GET', '/api/v1/memos/dory', undefined, cookie)).json()) as {
      fading: MemoDto[]; bottles: MemoDto[]; forgottenCount: number;
    };
    expect(page.fading.map((m) => m.content)).toEqual(['fading soon', 'fading later']);
    expect(page.bottles).toHaveLength(1);
    expect(page.forgottenCount).toBe(0);
  });
```

- [ ] **Step 2: Run to verify failure** (404 JSON catch-all → route missing).

- [ ] **Step 3: Implement** — after the `/export/markdown` route:

```ts
  // ---------- Dory's Memory ----------
  // Everything currently fading (soonest first) + bottles still at sea.
  // Static path: MUST stay registered before '/:uid'.
  app.get('/dory', (c) => {
    const viewer = requireViewer(c);
    const now = nowSeconds();
    const fading = db.$client
      .prepare(
        `SELECT * FROM memo WHERE creator_id = ? AND row_status = 'NORMAL'
         AND forget_at IS NOT NULL AND forget_at > ? ORDER BY forget_at ASC LIMIT 200`,
      )
      .all(viewer.id, now) as Record<string, unknown>[];
    const bottles = db.$client
      .prepare(
        `SELECT * FROM memo WHERE creator_id = ? AND row_status = 'NORMAL'
         AND surface_at IS NOT NULL AND surface_at > ? ORDER BY surface_at ASC LIMIT 200`,
      )
      .all(viewer.id, now) as Record<string, unknown>[];
    return c.json({
      fading: buildMemoDtos(db, fading.map(rawToMemoRow), viewer),
      bottles: buildMemoDtos(db, bottles.map(rawToMemoRow), viewer),
      forgottenCount: viewer.doryForgottenCount,
    });
  });
```

Export `rawToMemoRow` from memo-service (currently module-private).

- [ ] **Step 4: Run + commit** — `feat(server): Dory's Memory endpoint`

---

### Task 7: Scheduler service — tick with bottles, reminders, warnings, sweep + counter

**Files:**
- Create: `server/src/services/scheduler.ts`
- Modify: `server/src/services/dory-sweeper.ts` (sweep bumps `dory_forgotten_count`), `server/src/services/email.ts` (reminder message)
- Test: `server/src/test/scheduler.test.ts`

**Interfaces:**
- Consumes: `sweepDoryMemos(db, uploadsDir)`, `Mailer`/`trySend`, `getInstanceGeneral(db).name`, `snippet()`.
- Produces:

```ts
export interface SchedulerDeps { uploadsDir: string; mailer: Mailer | null; }
export interface SchedulerTickResult { surfaced: number; reminded: number; warned: number; forgotten: number; }
export function runSchedulerTick(db: Db, deps: SchedulerDeps, now?: number): SchedulerTickResult;
export function startScheduler(db: Db, deps: SchedulerDeps, intervalMs = 60_000): NodeJS.Timeout;
export function advanceReminder(due: number, every: 'DAILY' | 'WEEKLY' | 'MONTHLY'): number;
```

- [ ] **Step 1: Failing tests** (`scheduler.test.ts`) — drive each behavior by writing rows directly, then calling `runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer }, now)`:

```ts
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { inboxes, memos, users } from '../db/schema.js';
import { runSchedulerTick } from '../services/scheduler.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

const now = () => Math.floor(Date.now() / 1000);
const fakeMailer = (box: { to: string; subject: string; text: string }[]) => ({
  send: async (m: { to: string; subject: string; text: string }) => { box.push(m); },
});

describe('scheduler tick', () => {
  it('surfaces a due bottle: clears surface_at, BOTTLE_ARRIVED inbox item, memo appears in feed', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'from the past', surfaceAt: now() + 3600 });
    db.update(memos).set({ surfaceAt: now() - 10 }).where(eq(memos.uid, memo.uid)).run();
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    expect(result.surfaced).toBe(1);
    const row = db.select().from(memos).where(eq(memos.uid, memo.uid)).get()!;
    expect(row.surfaceAt).toBeNull();
    const items = db.select().from(inboxes).all();
    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe('BOTTLE_ARRIVED');
    // second tick is a no-op
    expect(runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null }).surfaced).toBe(0);
  });

  it('fires a due one-shot reminder: REMINDER inbox item + email, remind_at cleared', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'water the plants #chores' });
    db.update(memos).set({ remindAt: now() - 10 }).where(eq(memos.uid, memo.uid)).run();
    const box: { to: string; subject: string; text: string }[] = [];
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: fakeMailer(box) });
    expect(result.reminded).toBe(1);
    expect(db.select().from(memos).where(eq(memos.uid, memo.uid)).get()!.remindAt).toBeNull();
    expect(db.select().from(inboxes).all()[0]!.type).toBe('REMINDER');
    await new Promise((resolve) => setTimeout(resolve, 10)); // trySend is fire-and-forget
    expect(box).toHaveLength(1);
    expect(box[0]!.to).toBe('nemo@test.reef');
    expect(box[0]!.text).toContain('water the plants');
  });

  it('a recurring reminder advances instead of clearing (catch-up past downtime)', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'standup' });
    const due = now() - 3 * 86_400; // three days missed
    db.update(memos).set({ remindAt: due, remindEvery: 'DAILY' }).where(eq(memos.uid, memo.uid)).run();
    runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    const row = db.select().from(memos).where(eq(memos.uid, memo.uid)).get()!;
    expect(row.remindEvery).toBe('DAILY');
    expect(row.remindAt).toBeGreaterThan(now()); // advanced past now, not spammed per missed day
    expect(db.select().from(inboxes).all()).toHaveLength(1); // exactly one nudge
  });

  it('warns once when Dory is about to forget (≤1h left)', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const memo = await createMemo(app, cookie, { content: 'fading', dory: true });
    db.update(memos).set({ forgetAt: now() + 1800 }).where(eq(memos.uid, memo.uid)).run();
    expect(runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null }).warned).toBe(1);
    expect(runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null }).warned).toBe(0);
    expect(db.select().from(inboxes).all().filter((i) => i.type === 'DORY_WARNING')).toHaveLength(1);
  });

  it('sweeping bumps the per-user forgotten counter and skips reminders on expired memos', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const memo = await createMemo(app, cookie, { content: 'gone', dory: true });
    db.update(memos).set({ forgetAt: now() - 10, remindAt: now() - 10 }).where(eq(memos.uid, memo.uid)).run();
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    expect(result.forgotten).toBe(1);
    expect(result.reminded).toBe(0);
    expect(db.select().from(users).all()[0]!.doryForgottenCount).toBe(1);
    expect(db.select().from(memos).all()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** (module missing).

- [ ] **Step 3: Implement**:
  - `dory-sweeper.ts`: in the expired select, also fetch `creator_id`; inside the transaction, per-creator `UPDATE user SET dory_forgotten_count = dory_forgotten_count + ? WHERE id = ?` (count only directly-expired memos, not cascaded comments — the counter reads "Dory has forgotten N memos *for you*"). Delete `startDorySweeper` (the scheduler replaces it — fix imports in `index.ts` in Task 9; temporarily keep exports compiling).
  - `email.ts`: add

```ts
export function reminderMessage(instanceName: string, username: string, memoSnippet: string): Omit<MailMessage, 'to'> {
  return {
    subject: `A nudge from your reef 🐠`,
    text: `Hi ${username}!

You asked ${instanceName} to nudge you about this memo:

> ${memoSnippet}

Swim over to your reef's inbox to see it.

Just keep swimming 🐠`,
  };
}
```

  - `scheduler.ts` (sync, like the sweepers; raw prepared statements):
    1. **Surface bottles**: `SELECT id, creator_id FROM memo WHERE surface_at IS NOT NULL AND surface_at <= ?` → per row: `UPDATE memo SET surface_at = NULL WHERE id = ?` + insert inbox `{ senderId: creator_id, receiverId: creator_id, type: 'BOTTLE_ARRIVED', memoId: id }` (one transaction).
    2. **Reminders**: `SELECT id, creator_id, remind_at, remind_every, content FROM memo WHERE remind_at IS NOT NULL AND remind_at <= ? AND (forget_at IS NULL OR forget_at > ?)` → per row: insert inbox `REMINDER`; if `remind_every`, `let next = advanceReminder(remind_at, remind_every); while (next <= now) next = advanceReminder(next, remind_every);` and update `remind_at = next`, else `remind_at = NULL`. After the transaction, `trySend` one email per reminder to the creator's email (skip empty emails): `reminderMessage(getInstanceGeneral(db).name, username, snippet(content))`.
    3. **Warnings**: `SELECT id, creator_id FROM memo WHERE forget_at IS NOT NULL AND forget_at > ? AND forget_at <= ? + 3600 AND row_status = 'NORMAL' AND NOT EXISTS (SELECT 1 FROM inbox WHERE inbox.type = 'DORY_WARNING' AND inbox.memo_id = memo.id)` → insert inbox `DORY_WARNING` per row.
    4. **Sweep**: `sweepDoryMemos(db, deps.uploadsDir)`.
    - `advanceReminder`: DAILY `due + 86_400`; WEEKLY `due + 7 * 86_400`; MONTHLY via `const d = new Date(due * 1000); d.setUTCMonth(d.getUTCMonth() + 1); return Math.floor(d.getTime() / 1000);` (JS overflow on the 31st is acceptable and documented).
    - `startScheduler`: run once, then `setInterval` with try/catch logging `[scheduler] tick failed:`, `timer.unref()`.

- [ ] **Step 4: Run scheduler + full server suite** — green.
- [ ] **Step 5: Commit** — `feat(server): minute-tick scheduler — bottles, reminders, dory warnings, counter`

---

### Task 8: Wire the scheduler into both entry points

**Files:**
- Modify: `server/src/index.ts`, `server/src/cloud/index.ts`

**Interfaces:**
- Consumes: `startScheduler`, `runSchedulerTick` from Task 7.

- [ ] **Step 1: index.ts** — replace the `startDorySweeper` import/call with:

```ts
import { makeSmtpMailer } from './services/email.js';
import { startScheduler } from './services/scheduler.js';
// …
startScheduler(db, { uploadsDir: config.uploadsDir, mailer: config.smtp ? makeSmtpMailer(config.smtp) : null });
```

- [ ] **Step 2: cloud/index.ts** — replace the per-reef `sweepDoryMemos` interval body with `runSchedulerTick(handle.db, { uploadsDir: handle.config.uploadsDir, mailer });` where `const mailer = base.smtp ? makeSmtpMailer(base.smtp) : null;` is hoisted once (reuse the existing billing mailer variable if convenient). Rename the log tag to `[scheduler]`.

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm test` (cloud-isolation suite must stay green: scheduler is per-reef DB, no cross-tenant surface).

- [ ] **Step 4: Commit** — `feat(server): scheduler wired into self-host + cloud entry points`

---

### Task 9: Export frontmatter — bottles and reminders

**Files:**
- Modify: `server/src/services/export-service.ts` (next to the `forgets:` line ~74)
- Test: extend `server/src/test/export.test.ts` with one assertion

- [ ] **Step 1: Failing test** — create a bottle memo, export, assert its `.md` contains `surfaces: <iso>`.
- [ ] **Step 2: Implement**:

```ts
  if (row.surfaceAt != null) lines.push(`surfaces: ${isoSeconds(row.surfaceAt)}`);
  if (row.remindAt != null) lines.push(`reminds: ${isoSeconds(row.remindAt)}`);
```

- [ ] **Step 3: Run + commit** — `feat(server): export frontmatter notes bottles + reminders`

---

### Task 10: Web plumbing — queries, editor windows + bottle, action-menu reminders

**Files:**
- Modify: `web/src/hooks/queries.ts`, `web/src/components/editor/MemoEditor.tsx`, `web/src/components/memo/MemoActionMenu.tsx`, `web/src/components/memo/DoryBadge.tsx`, `web/src/components/memo/MemoCard.tsx`, `web/src/lib/utils.ts`

**Interfaces:**
- Consumes: DTO fields + `DORY_WINDOWS`, `DORY_WINDOW_SECONDS`, `REMIND_REPEATS` from shared.
- Produces: `keys.dory = ['memos','dory']`, `useDoryPage()` → `{ fading: MemoDto[]; bottles: MemoDto[]; forgottenCount: number }`; `CreateMemoInput` + `doryWindow?`, `surfaceAt?`.

- [ ] **Step 1: queries.ts** — add key + hook (query `/api/v1/memos/dory`, `staleTime: 30_000`); extend `CreateMemoInput`. `useInvalidateMemos` already nukes `['memos']` so `keys.dory` invalidates with edits — keep the key under that prefix.

- [ ] **Step 2: utils.ts** — `forgetCountdown` gains a days tier: after the hours line, `if (remaining >= 48 * 3600) return \`${Math.ceil(remaining / 86_400)}d\`;` placed BEFORE the `h` return so 3d/7d windows read "3d", not "72h". Add `epochToLocalInput(epoch: number): string` and `localInputToEpoch(value: string): number` helpers (datetime-local ↔ epoch seconds).

- [ ] **Step 3: MemoEditor** — state `doryWindow: DoryWindow` (default `'24h'`) and `surfaceAt: number | null` (initial from `memo?.surfaceAt ?? null`). The Dory pill becomes a `DropdownMenu`: trigger looks like today's pill but labels `Dory · {window}` when on; items = "Off" + the four windows (`1 hour / 24 hours / 3 days / 7 days`, reef hint "Dory forgets it after {w}"). Save paths send `dory` + `doryWindow` (create), `dory`/`doryWindow` (edit, non-comment). Next to it a bottle button (`Hourglass` icon, label "Bottle") opening a small `Dialog`: `<input type="datetime-local" min={nowLocal}>` + reef copy ("Seal it in a bottle — it stays hidden until this day arrives."), Set/Remove buttons → `surfaceAt` state; when set, show a chip `surfaces {date}` with an X. Create/edit payloads include `surfaceAt` (edit sends `surfaceAt: null` to cancel). Pinned memos disable both (assertTimeRules mirrors server).

- [ ] **Step 4: MemoActionMenu** —
  - "Make it a Dory memo" becomes a sub-menu (`Fish` trigger) with the four windows → `update.mutate({ uid, dory: true, doryWindow: w })`; "Let Dory remember it" stays a single item when `forgetAt != null`.
  - New item for `isCreator && !archived`: `AlarmClock` icon, label `memo.remindAt ? 'Change the nudge…' : 'Nudge me about this'` → opens `ReminderDialog` (new local component in the same file): datetime-local input (prefilled from `memo.remindAt`), repeat `<select>` (Doesn't repeat / Daily / Weekly / Monthly), Save → `update.mutate({ uid, remindAt, remindEvery })`, and a "Remove nudge" button when set → `{ remindAt: null }`.

- [ ] **Step 5: Badges** — `DoryBadge` tooltip becomes window-agnostic: "Dory forgets this memo when its time is up. Archive it to keep it." In `MemoCard` next to `DoryBadge` render: `{memo.remindAt != null ? <Tip label={`Nudge ${absoluteTime(memo.remindAt)}${memo.remindEvery ? ' · repeats' : ''}`}><AlarmClock className="size-3.5 text-primary" aria-label="Reminder set" /></Tip> : null}` and `{memo.surfaceAt != null ? <Tip label={`Surfaces ${absoluteTime(memo.surfaceAt)}`}><Hourglass className="size-3.5 text-ocean" aria-label="Bottle at sea" /></Tip> : null}` (bottle icon shows only on the Dory page / detail — feeds never contain pending bottles).

- [ ] **Step 6: Verify** — `pnpm typecheck && pnpm --filter @nemomemo/web test` (markdown-bridge suite untouched but run it).
- [ ] **Step 7: Commit** — `feat(web): dory windows, bottle picker, reminder dialog`

---

### Task 11: Web — Dory's Memory page + sidebar + route

**Files:**
- Create: `web/src/pages/DoryMemory.tsx`
- Modify: `web/src/App.tsx` (route `/dory`, RequireAuth, inside AppShell), `web/src/components/layout/Sidebar.tsx` (NavItem `Fish` icon "Dory" after Archived)

**Interfaces:**
- Consumes: `useDoryPage()` from Task 10, `MemoCard`, `EmptyState`/`LoadingState`, `forgetCountdown`, `absoluteTime`.

- [ ] **Step 1: Page** — header `Fish` icon + "Dory's Memory", subtitle "Everything currently fading, soonest first — and bottles still at sea." Stats line (when `forgottenCount > 0`): "Dory has forgotten **{n}** memo{s} for you. 🫧". Section "Fading": `MemoCard` list (feed layout). Section "Bottles at sea" (`Hourglass` icon): `MemoCard` list; each card already shows the surfacing chip from Task 10. Empty states: fading — title "Nothing is fading", hint "Hand a memo to Dory and it'll wait here until she forgets it."; bottles — title "No bottles at sea", hint "Seal a memo in a bottle and it surfaces on the day you pick."

- [ ] **Step 2: Route + nav** — App.tsx `<Route path="/dory" element={<RequireAuth><DoryMemoryPage /></RequireAuth>} />`; Sidebar `<NavItem to="/dory" icon={<Fish className="size-4" />} label="Dory" />` between Archived and Attachments.

- [ ] **Step 3: Verify + commit** — `pnpm typecheck`; `feat(web): Dory's Memory page`

---

### Task 12: Web — inbox renders the three new types + one-click Keep

**Files:**
- Modify: `web/src/pages/Inbox.tsx`

**Interfaces:**
- Consumes: extended `InboxDto['type']`, `useUpdateMemo`.

- [ ] **Step 1: Implement** — icon per type: `REMINDER` → `AlarmClock` (text-primary), `BOTTLE_ARRIVED` → `Hourglass` (text-ocean), `DORY_WARNING` → `Fish` (text-dory); existing mention/comment icons unchanged. These are self-notifications: skip the sender avatar and render copy without a name — `REMINDER`: "A nudge you asked for 🔔", `BOTTLE_ARRIVED`: "A bottle washed ashore — a memo from past you", `DORY_WARNING`: "Dory is about to forget this memo". For `DORY_WARNING` rows with a `memoUid`, add a "Keep it" button (`Fish` icon, outline, size sm) → `update.mutate({ uid: item.memoUid, dory: false })` then `action.mutate({ id: item.id, action: 'read' })`. Update the empty-state hint: "New comments, mentions, nudges, and bottles will surface here."

- [ ] **Step 2: Verify + commit** — `pnpm typecheck`; `feat(web): inbox handles reminders, bottles, dory warnings`

---

### Task 13: Docs — internal + public, roadmap check-off

**Files:**
- Modify: `docs/claude/GOTCHAS.md`, `docs/claude/DATA-MODEL.md`, `docs/claude/MAP.md`, `docs/ROADMAP.md`, `site/content/docs/dory.mdx`, `site/content/docs/memos.mdx`

- [ ] **Step 1: GOTCHAS.md** — under Data & queries add: feed queries now carry TWO time guards (`forget_at` and `surface_at` patterns, both greppable); bottle rules (pending bottle = creator-only in ACL, hidden from all feeds including owner's, share tokens don't reveal it; comments can't be bottles; pinned ⟂ bottle; dory+bottle requires `forget_at > surface_at`); the dory-sweeper is now one pass of `services/scheduler.ts` — new time-based work belongs in the tick, not a new interval.
- [ ] **Step 2: DATA-MODEL.md** — memo row gains `remind_at`, `remind_every`, `surface_at` (+ partial indexes); user gains `dory_forgotten_count`; inbox types list extended; migrations table row for 0005.
- [ ] **Step 3: MAP.md** — services table: `dory-sweeper.ts` → note "one pass of scheduler.ts"; add `scheduler.ts` row; routes table: `/memos/dory`; web routes: `/dory`; pages list: DoryMemory.
- [ ] **Step 4: ROADMAP.md** — mark the eight Wave 1 rows ✅ v1.14.0 with one-line shipped notes (keep the wave as the record, like P1).
- [ ] **Step 5: dory.mdx** — new/updated sections in the docs voice: forget windows (1h/24h/3d/7d picker, default 24h; `DORY_TTL_SECONDS` still the instance default), the about-to-forget inbox notice with Keep it, Dory's Memory page (`/dory`), forgotten counter, reminders ("Nudge me about this" — one-shot + daily/weekly/monthly, email when the instance has SMTP), message in a bottle (hidden until its date, creator-only, arrives in the inbox). memos.mdx: add reminder + bottle to the ⋯-menu/composer feature rundown if it enumerates actions.
- [ ] **Step 6: Commit** — `docs: time layer — internal maps + public dory/memos docs`

---

### Task 14: Release v1.14.0

- [ ] **Step 1: Full verification** — `pnpm typecheck && pnpm test && pnpm build` all green.
- [ ] **Step 2: `pnpm release minor`** (run 1 scaffolds `docs/changelog/v1.14.0.md`) → fill BOTH sections — "What's new" in plain reef language (forget windows, nudges, bottles, Dory's Memory, the warning notice, the counter; recurring nudges), "Technical notes" (migration 0005, scheduler service, ACL surface_at rules, new inbox types, `/api/v1/memos/dory`, DTO fields) → `pnpm release minor` run 2 (bumps, commits `release: v1.14.0`, tags).
- [ ] **Step 3: Push** — `git push --follow-tags`.
- [ ] **Step 4: Watch the deploy** — poll `https://demo.trynemomemo.com/api/v1/instance/profile` (background loop) until `version` reports 1.14.0 (~4 min).
- [ ] **Step 5: Live-verify on demo.trynemomemo.com** (never david.trynemomemo.com): sign in with a demo account, create a Dory memo with a 1h window (expect the badge + an immediate warning within a minute), set a nudge, seal a bottle, open /dory, check the inbox renderings. Demo resets 09:00 UTC so leftovers are fine.

---

## Self-Review

- **Spec coverage:** Scheduler ✅ T7/T8 · forget window ✅ T2/T5/T10 · reminders ✅ T5/T7/T10 · bottle ✅ T3/T4/T5/T7/T10 · warning notice ✅ T7/T12 · Dory's Memory ✅ T6/T11 · statistics ✅ T1/T7/T6/T11 · recurring reminders ✅ T5/T7/T10 (folded into the reminder tasks — same columns, `advanceReminder`). Docs rule ✅ T13. One migration ✅ T1.
- **Type consistency:** `assertTimeRules(pinned, forgetAt, surfaceAt)` used in T3/T5; `runSchedulerTick(db, {uploadsDir, mailer}, now?)` in T7/T8; DTO fields `remindAt/remindEvery/surfaceAt` in T2/T3/T10; `rawToMemoRow` exported in T6.
- **Known judgment calls (documented for the reviewer):** 1h-window Dory memos get their warning immediately (accurate, mildly noisy — accepted); surfaced bottles keep their original `createdTs` (the inbox item is the arrival moment); reminder emails carry a snippet, no link (the server doesn't know its public URL); recurring reminders catch up past downtime with a single nudge.
