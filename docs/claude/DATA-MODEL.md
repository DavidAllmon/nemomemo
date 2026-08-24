# Data model

SQLite via Drizzle (better-sqlite3, synchronous). Schema source of truth:
`server/src/db/schema.ts` + numbered migrations in `server/src/db/migrations/`
(hand-rolled, applied at boot in a transaction, tracked in `schema_migration` —
see GOTCHAS.md). `db/index.ts` sets `journal_mode=WAL`, `foreign_keys=ON`,
`busy_timeout=5000`. All timestamps are epoch **seconds** (`lib/time.ts` →
`nowSeconds()`, centralized for fake timers in tests).

## Tenant tables (one DB per self-host instance / per cloud reef)

| Table | Columns (key points) |
| --- | --- |
| `user` | id PK; created_ts/updated_ts; row_status `NORMAL\|ARCHIVED`; username (unique); role `ADMIN\|USER`; email, nickname, password_hash (bcrypt), avatar_url, description; **dory_forgotten_count** (lifetime "Dory has forgotten N memos for you", bumped by the sweep) |
| `user_session` | user_id → user (cascade); **token_hash** — sha256 of the opaque cookie token, never the token itself; created_ts, expires_ts, last_seen_ts (30-day sliding TTL, touched at most daily) |
| `memo` | id PK; **uid** (text, unique — the public identifier used in URLs/API); creator_id → user (cascade); row_status `NORMAL\|ARCHIVED`; content (raw markdown); visibility `PUBLIC\|PROTECTED\|PRIVATE` (default PRIVATE); pinned (bool); **payload** (derived JSON index — see below); **forget_at** (nullable epoch — Dory expiry; partial index `idx_memo_forget_at`); **remind_at** + **remind_every** `DAILY\|WEEKLY\|MONTHLY` (nullable — reminders; partial index `idx_memo_remind_at`); **surface_at** (nullable epoch — message in a bottle, hidden until then; partial index `idx_memo_surface_at`); **deleted_at** (nullable epoch — trash; the scheduler purges after `TRASH_RETENTION_SECONDS` (7d); partial index `idx_memo_deleted_at`) |
| `memo_relation` | memo_id → memo, related_memo_id → memo, type `REFERENCE\|COMMENT`; unique(memo, related, type). COMMENT rows point **child → parent** |
| `attachment` | uid (unique); creator_id → user; filename, type (mime), size; memo_id → memo (**set null** when memo dies); storage_path relative to uploadsDir |
| `reaction` | creator_id, memo_id, emoji; unique(creator, memo, emoji) |
| `memo_share` | uid = 22-char share token; memo_id, creator_id; expires_ts nullable (null = never) |
| `inbox` | sender_id (no FK), receiver_id → user; status `UNREAD\|READ\|ARCHIVED`; type `MEMO_COMMENT\|MEMO_MENTION\|MEMO_THREAD\|REMINDER\|BOTTLE_ARRIVED\|DORY_WARNING` (the last three are self-notifications: sender = receiver = creator); memo_id nullable (cascade) |
| `auth_token` | user_id → user (cascade); purpose `EMAIL_VERIFY\|PASSWORD_RESET`; **token_hash** (sha256, never raw); expires_ts; used_ts (single-use). Verify TTL 7d, reset 1h |
| `user_setting` | user_id + key (unique pair), value JSON. Keys: `GENERAL`, `MEMO_VIEWS` |
| `instance_setting` | name (unique), value JSON. Names: `GENERAL`, `MEMO` |

Settings values are Zod-validated on read AND write with safe fallbacks
(`services/settings.ts`).

## `memo.payload` — the derived index

Built by `buildPayload()` (shared, one remark AST walk) on **every content write**;
queried with `json_extract`/`json_each`. Contains:

- `tags`: string[] — includes implied ancestors (`a/b` produces `a` AND `a/b`)
- mentions (usernames referenced with `@`)
- `has_*` property booleans (link / code / task list / incomplete tasks…)

**Never authoritative** — if extraction logic changes, existing rows are stale until
backfilled. Filter compilation over it lives in `services/filter-sql.ts` (tags via
`json_each`, properties via `json_extract`, LIKE-escaped, frozen `now`).

## Migrations

| File | Contents |
| --- | --- |
| `0001_init.sql` (then 0002/0003 inbox rebuilds, 0004 email identity) | Full tenant schema, CHECK constraints, indexes: `idx_memo_creator_status`, `idx_memo_visibility`, partial `idx_memo_forget_at`, `idx_memo_relation_related`, `idx_attachment_memo_id`, `idx_reaction_memo_id`, `idx_memo_share_memo_id`, `idx_inbox_receiver` |
| `0005_time_layer.sql` | `memo.remind_at`/`remind_every`/`surface_at` + partial indexes, `user.dory_forgotten_count`, inbox rebuild adding `REMINDER`/`BOTTLE_ARRIVED`/`DORY_WARNING` to the type CHECK |
| `0006_fts_search.sql` | External-content `memo_fts` (FTS5 over `memo.content`) + insert/update/delete triggers + a backfill; `content.contains(…)` compiles to a phrase-prefix MATCH |
| `0007_ocr.sql` | `attachment.extracted_text` (OCR for images, transcripts for audio) + `attachment_fts` on the same trigger pattern |
| `0008_trash.sql` | `memo.deleted_at` + partial `idx_memo_deleted_at` — the trash guard |

Adding one: next number, `.sql` only, plus the matching `schema.ts` edit. The build
copies `src/db/migrations` → `dist/migrations`.

## Cloud registry DB (separate: `data/registry.db`)

Own migration chain in `server/src/cloud/registry.ts` — completely separate from the
tenant schema:

| Table | Purpose |
| --- | --- |
| `reef` | slug, status `provisioned\|active\|past_due\|suspended\|canceled`, Stripe customer + subscription ids |
| `claim_token` | token_hash, reef_id, expires_ts, used_ts — one-shot claim links |

Slug rules: `REEF_SLUG_RE` + `RESERVED_SLUGS` in registry.ts. Each reef's tenant data
lives at `data/reefs/<slug>/` (its own SQLite + uploads), opened lazily by `ReefFleet`
(LRU, default 64 open) with migrations run on first open.

## Key invariant reminders (full list in GOTCHAS.md)

- Every memo-reading query carries `forget_at IS NULL OR forget_at > now` **and**
  `deleted_at IS NULL`; feed-like queries also carry
  `surface_at IS NULL OR surface_at <= now`. `buildMemoListWhere` is the one builder.
- Comments are memos joined via `memo_relation` type COMMENT; feeds exclude them with
  `NOT EXISTS`.
- Visibility decisions only via `services/acl.ts` (`checkMemoRead` / `canGlimpseMemo`).
