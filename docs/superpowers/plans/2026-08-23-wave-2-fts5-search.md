# FTS5 Full-Text Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `LIKE` content scan in filter compilation with an SQLite FTS5 full-text index that is kept in sync by triggers and backfilled by migration.

**Architecture:** Migration `0006` creates an external-content FTS5 virtual table (`memo_fts`, content=`memo`) plus three triggers (insert/delete/update-of-content), so *every* write path — memo create/update/delete, comments, tag rename, snapshot restore (which swaps the DB file and re-runs migrations at boot) — stays in sync by construction, with zero application-code sync sites. `filter-sql.ts` compiles `contentMatch` mode `contains` to `memo.id IN (SELECT rowid FROM memo_fts WHERE memo_fts MATCH ?)` using a sanitized phrase-prefix query; `startsWith`/`endsWith` (positional, inexpressible in FTS) and token-free inputs (punctuation/emoji) keep the existing LIKE path. Feed ordering stays chronological (memos are a journal; relevance ordering is a possible follow-up, not this release).

**Tech Stack:** SQLite FTS5 (bundled in better-sqlite3), hand-rolled SQL migration, vitest via `makeTestApp()` route tests.

**Spec:** `docs/ROADMAP.md` § Wave 2 (FTS5 row) + cloud-execution-handoff memory (2026-08-23). Wave 1 plan pattern: `docs/superpowers/plans/2026-08-23-wave-1-time-layer.md`.

## Global Constraints

- Push to main = production for paying customers in ~4 min. Only push `pnpm typecheck && pnpm test && pnpm build` green.
- App-code push requires `pnpm release minor` (two-run flow, BOTH changelog sections) + `git push --follow-tags`. Target version: **v1.16.0**.
- Every new memo query keeps BOTH time guards: `forget_at IS NULL OR forget_at > now` AND (feeds) `surface_at IS NULL OR surface_at <= now`. The FTS subquery is a WHERE fragment ANDed inside `listMemoRows`, so guards remain in the outer query — do not move them.
- Never edit shipped migrations (0001–0005). New file: `0006_fts_search.sql`. Build copies migrations into dist (already handled by existing build config — verify `dist/` contains 0006 after `pnpm build`).
- `memo_fts` is a virtual table queried via raw SQL only — it is deliberately NOT added to `db/schema.ts` (drizzle never touches it; the schema.ts-must-match rule applies to real tables).
- Migration rehearsal against a seeded pre-migration DB is REQUIRED before shipping (rule 9).
- No self-hoster config changes ⇒ no `site/content/docs/` update needed this release (public-docs-rule not triggered).
- Behavior change to document in changelog: `contains` search becomes word/prefix-based and accent-insensitive ("swim" finds "swimming"; "café" finds "cafe"; mid-word substrings like "ish"→"fish" no longer match).

---

### Task 1: Migration 0006 — FTS table, triggers, backfill (+ rehearsal)

**Files:**
- Create: `server/src/db/migrations/0006_fts_search.sql`
- Create: `server/src/test/search.test.ts` (migration/trigger sync tests; grows in Task 3)
- Create (scratchpad, not committed): `<scratchpad>/rehearse-0006.mjs`

**Interfaces:**
- Produces: virtual table `memo_fts(content)` with `rowid` = `memo.id`, queryable as `SELECT rowid FROM memo_fts WHERE memo_fts MATCH ?`. Tokenizer: `unicode61 remove_diacritics 2`.

- [ ] **Step 1: Write failing sync tests**

`server/src/test/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestApp, jsonRequest, signUp } from './helpers.js';

const ftsIds = (db: import('../db/index.js').Db, match: string): number[] =>
  (db.$client.prepare('SELECT rowid FROM memo_fts WHERE memo_fts MATCH ?').all(match) as { rowid: number }[])
    .map((r) => r.rowid);

describe('memo_fts stays in sync via triggers', () => {
  it('indexes existing rows via backfill and new rows via insert trigger', async () => {
    const { app, db } = makeTestApp();
    const { cookie } = await signUp(app, 'nemo');
    const res = await jsonRequest(app, 'POST', '/api/v1/memos', { content: 'anemone home' }, cookie);
    expect(res.status).toBe(200);
    expect(ftsIds(db, '"anemone"')).toHaveLength(1);
  });

  it('re-indexes on content update and de-indexes on delete', async () => {
    const { app, db } = makeTestApp();
    const { cookie } = await signUp(app, 'nemo');
    const res = await jsonRequest(app, 'POST', '/api/v1/memos', { content: 'barnacle' }, cookie);
    const { uid } = (await res.json()) as { uid: string };
    await jsonRequest(app, 'PATCH', `/api/v1/memos/${uid}`, { content: 'kelp forest' }, cookie);
    expect(ftsIds(db, '"barnacle"')).toHaveLength(0);
    expect(ftsIds(db, '"kelp"')).toHaveLength(1);
    await jsonRequest(app, 'DELETE', `/api/v1/memos/${uid}`, undefined, cookie);
    expect(ftsIds(db, '"kelp"')).toHaveLength(0);
  });
});
```

(Adapt `signUp` to the actual helper in `server/src/test/helpers.ts` — reuse whatever `memos.test.ts` uses to create a session; do not invent a new helper.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/search.test.ts`
Expected: FAIL with `no such table: memo_fts`.

- [ ] **Step 3: Write the migration**

`server/src/db/migrations/0006_fts_search.sql`:

```sql
-- FTS5 full-text index over memo content (external-content table).
-- Triggers keep it in sync with EVERY write path (routes, tag rename,
-- restored databases re-migrated at boot) by construction.
-- The final INSERT backfills rows that existed before this migration.

CREATE VIRTUAL TABLE memo_fts USING fts5(
  content,
  content='memo',
  content_rowid='id',
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TRIGGER memo_fts_after_insert AFTER INSERT ON memo BEGIN
  INSERT INTO memo_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER memo_fts_after_delete AFTER DELETE ON memo BEGIN
  INSERT INTO memo_fts(memo_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;

CREATE TRIGGER memo_fts_after_update AFTER UPDATE OF content ON memo BEGIN
  INSERT INTO memo_fts(memo_fts, rowid, content) VALUES ('delete', old.id, old.content);
  INSERT INTO memo_fts(rowid, content) VALUES (new.id, new.content);
END;

INSERT INTO memo_fts(rowid, content) SELECT id, content FROM memo;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/search.test.ts`
Expected: PASS. Then run the FULL server suite (`pnpm --filter @nemomemo/server exec vitest run`) — 144 existing tests must stay green (they all boot the migration).

- [ ] **Step 5: Rehearse the migration against a seeded pre-0006 DB**

Write `<scratchpad>/rehearse-0006.mjs` following the Wave 1 pattern: open a temp file DB with better-sqlite3, apply `0001`–`0005` .sql files by hand in order (recording them in `schema_migration`), seed a user + ~50 memos with raw INSERTs (varied content, one with diacritics), close, then call the built `createDb()` (via `tsx` importing `server/src/db/index.ts`) on that file and assert: `SELECT count(*) FROM memo_fts` equals memo count; a `MATCH` finds a seeded word; an INSERT after reopen is picked up by the trigger; `PRAGMA integrity_check` is ok. Run it with `pnpm --filter @nemomemo/server exec tsx <script>`. Delete nothing from the repo — script lives in scratchpad only.

- [ ] **Step 6: Commit**

```bash
git add server/src/db/migrations/0006_fts_search.sql server/src/test/search.test.ts
git commit -m "feat(server): FTS5 index over memo content — migration 0006 (triggers + backfill)"
```

---

### Task 2: FTS query builder in filter-sql

**Files:**
- Modify: `server/src/services/filter-sql.ts`
- Test: `server/src/test/search.test.ts` (append a describe block)

**Interfaces:**
- Produces: `export function toFtsMatchQuery(value: string): string | null` — returns an FTS5 phrase-prefix query (`"coral reef"*`) or `null` when the input has no indexable tokens (caller falls back to LIKE).

- [ ] **Step 1: Write failing unit tests**

Append to `search.test.ts`:

```ts
import { toFtsMatchQuery } from '../services/filter-sql.js';

describe('toFtsMatchQuery', () => {
  it('quotes a single word with prefix', () => {
    expect(toFtsMatchQuery('reef')).toBe('"reef"*');
  });
  it('keeps multi-word input as one phrase with trailing prefix', () => {
    expect(toFtsMatchQuery('coral reef')).toBe('"coral reef"*');
  });
  it('strips FTS syntax and punctuation down to tokens', () => {
    expect(toFtsMatchQuery('reef AND (kelp) OR "x"')).toBe('"reef AND kelp OR x"*');
  });
  it('returns null when nothing is indexable', () => {
    expect(toFtsMatchQuery('!!! ???')).toBeNull();
    expect(toFtsMatchQuery('🐠')).toBeNull();
    expect(toFtsMatchQuery('')).toBeNull();
  });
});
```

Note: `AND`/`OR` inside double quotes are literal tokens, not operators — keeping them is correct phrase behavior.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/search.test.ts -t toFtsMatchQuery`
Expected: FAIL — `toFtsMatchQuery` is not exported.

- [ ] **Step 3: Implement**

In `filter-sql.ts`:

```ts
/**
 * Turn raw user search text into a safe FTS5 phrase-prefix query
 * (`"coral reef"*`), or null when the input has no indexable tokens
 * (punctuation/emoji only — the caller falls back to LIKE).
 */
export function toFtsMatchQuery(value: string): string | null {
  const tokens = value.match(/[\p{L}\p{N}_]+/gu);
  if (!tokens || tokens.length === 0) return null;
  return `"${tokens.join(' ')}"*`;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/filter-sql.ts server/src/test/search.test.ts
git commit -m "feat(server): toFtsMatchQuery — sanitize search text into FTS5 phrase-prefix queries"
```

---

### Task 3: Compile `contains` to FTS MATCH; route-level search behavior

**Files:**
- Modify: `server/src/services/filter-sql.ts:27-37` (the `contentMatch` case)
- Test: `server/src/test/search.test.ts` (append route-level describe block)

**Interfaces:**
- Consumes: `toFtsMatchQuery` (Task 2), `memo_fts` (Task 1).
- Produces: `contentMatch`/`contains` compiles to `(memo.id IN (SELECT rowid FROM memo_fts WHERE memo_fts MATCH ?))`; `startsWith`/`endsWith` and null-token inputs unchanged (LIKE).

- [ ] **Step 1: Write failing route tests**

Append to `search.test.ts` (use the same session/list helpers as `memos.test.ts` — `filter=` + encoded expression against `/api/v1/memos`):

```ts
describe('search via content.contains (FTS-backed)', () => {
  it('finds by word, prefix, and accent-insensitively; misses mid-word substrings', async () => {
    // seed: 'Swimming lessons at the café', 'Nothing relevant'
    // contains("swim")  -> 1 hit (prefix)
    // contains("cafe")  -> 1 hit (remove_diacritics)
    // contains("immi")  -> 0 hits (no mid-word substring — documented change)
  });
  it('multi-word search matches the phrase across punctuation', async () => {
    // seed: 'coral, reef notes' ; contains("coral reef") -> 1 hit
  });
  it('punctuation-only search falls back to LIKE and still matches', async () => {
    // seed: 'look ::: here' ; contains(":::") -> 1 hit
  });
  it('startsWith/endsWith keep exact positional semantics', async () => {
    // content.startsWith("Swim") matches, content.startsWith("lessons") does not
  });
  it('never leaks through time guards: expired dory + pending bottle stay hidden', async () => {
    // create dory memo, force forget_at into the past via db.$client UPDATE (copy dory.test.ts pattern);
    // create bottle with future surface_at;
    // contains(<word>) returns neither, even though both rows sit in memo_fts
  });
  it('comments never surface as top-level search results', async () => {
    // memo + comment containing unique word; search home feed for that word -> 0 rows
    // (comment excluded by NOT EXISTS; parent lacks the word)
  });
  it('negated and combined filters still compile', async () => {
    // filter: !content.contains("kelp") && pinned == false -> expected rows
  });
});
```

Write these as real tests (the comments above are the scenarios — each needs actual seed + request + assertion code in the style of `memos.test.ts` / `dory.test.ts` / `bottles.test.ts`).

- [ ] **Step 2: Run to verify the FTS-specific ones fail**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/search.test.ts`
Expected: prefix/diacritics tests FAIL (LIKE has no prefix/diacritic behavior); guard tests may already pass — that's fine, they're regression armor.

- [ ] **Step 3: Implement the compilation switch**

Replace the `contentMatch` case in `compileFilter`:

```ts
case 'contentMatch': {
  if (n.mode === 'contains') {
    const match = toFtsMatchQuery(n.value);
    if (match != null) {
      params.push(match);
      return `(memo.id IN (SELECT rowid FROM memo_fts WHERE memo_fts MATCH ?))`;
    }
  }
  // startsWith/endsWith are positional (FTS can't express them), and
  // token-free strings (punctuation, emoji) have nothing to MATCH —
  // both keep the LIKE scan.
  const escaped = n.value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
  const pattern =
    n.mode === 'contains'
      ? `%${escaped}%`
      : n.mode === 'startsWith'
        ? `${escaped}%`
        : `%${escaped}`;
  params.push(pattern);
  return `(memo.content LIKE ? ESCAPE '\\' COLLATE NOCASE)`;
}
```

- [ ] **Step 4: Run the whole server suite**

Run: `pnpm --filter @nemomemo/server exec vitest run`
Expected: ALL PASS — including `memos.test.ts:125` (`content.contains("reef")`) now going through FTS, and `cloud-isolation.test.ts` untouched.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/filter-sql.ts server/src/test/search.test.ts
git commit -m "feat(server): compile content.contains to ranked FTS5 MATCH (LIKE kept for positional/token-free)"
```

---

### Task 4: Full verify, browser smoke, release v1.16.0, deploy watch

**Files:**
- Create: `docs/changelog/v1.16.0.md` (scaffolded by first `pnpm release` run)
- Modify: root `package.json` + `shared/src/version.ts` (by the release script — never by hand)

- [ ] **Step 1: Full green check**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all pass; then verify `ls server/dist/**/0006*` shows the migration got copied into dist.

- [ ] **Step 2: Browser smoke test**

`pnpm dev`, then via chrome-devtools MCP against `http://localhost:5173`: sign up/in, create memos ('Swimming lessons today', 'kelp forest dive'), use the search dialog to search `swim` → both the exact and prefix hit appear; search `xyz` → reef-voiced empty state. (React-controlled inputs: set value via native setter + reset `_valueTracker` + dispatch input event — known quirk.) Stop dev servers after.

- [ ] **Step 3: Release**

Run `pnpm release minor` (first run scaffolds `docs/changelog/v1.16.0.md`). Fill BOTH sections — What's new (plain language): search now understands words — typing "swim" finds "swimming", accents don't matter, and results come back instantly even in a reef with thousands of memos. Technical notes: FTS5 external-content table + trigger sync + backfill migration 0006; `contains` → MATCH phrase-prefix; LIKE retained for startsWith/endsWith/token-free; substring-of-word matches no longer hit. Run `pnpm release minor` again to bump/commit/tag. Then `git push --follow-tags`.

- [ ] **Step 4: Watch deploy + live verify**

Background loop polling `https://demo.trynemomemo.com/api/v1/instance/profile` until version reports v1.16.0 (~4–8 min). Then live-verify on demo (playground account, never david.trynemomemo.com): search seeded demo content for a word-prefix and confirm hits.

- [ ] **Step 5: Update handoff memory**

Mark Wave 2 item 1 shipped in the cloud-execution-handoff memory; next item = route-level code splitting (audit #4) then task rollup.

---

## Self-review notes

- Spec coverage: ranked FTS ✅ (bm25 relevance *ordering* deliberately deferred — feeds stay chronological; noted in changelog + memory). Synced on every write ✅ (triggers ⊃ the listed create/update/delete/comment/restore paths). Backfill ✅. Wired into filter-sql contentMatch ✅. Both time guards ✅ (untouched in `listMemoRows`; regression test added).
- No schema.ts edit — intentional, virtual table is raw-SQL-only (documented in Global Constraints).
- Web needs no change: parser (shared) and chips still emit `content.contains(...)`.
