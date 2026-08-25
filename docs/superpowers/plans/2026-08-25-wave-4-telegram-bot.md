# Telegram Capture Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Message a Telegram bot and it becomes a memo in your reef — text, photos, and voice notes — with `#tags` working inline and no app to install.

**Architecture:** A long-polling service (`services/telegram.ts`) started only from the single-tenant branch of `index.ts`, so cloud mode can never spin up N pollers against one bot token. A chat is bound to a member by a short-lived one-time code minted in Settings. Incoming messages become memos through the same services the API uses; media rides a new `storeAttachment()` extracted from the upload route, so OCR and transcription work exactly as they do for browser uploads.

**Tech Stack:** Existing stack + Telegram's HTTP Bot API via `fetch` (no SDK). No new npm dependencies.

**Spec:** `docs/ROADMAP.md` § Wave 4 "Telegram capture bot"; David's call 2026-08-25: Telegram → PWA, Discord tabled.

## Global Constraints

- Green only; `pnpm release minor` two-run flow; push; poll demo; live-verify.
- **New env var ⇒ `.env.example` AND `site/content/docs/deploy.mdx` in the SAME release** (standing rule).
- Cloud ships dark: the poller must not start in cloud mode; single-tenant behavior with the var unset must be byte-identical to today.
- Linking is account-level ⇒ session-only (`requireSessionViewer`), like token management.
- Never log the bot token or message contents.
- No network in tests: inject a fake `fetch`, the `dictationFetch` pattern.

---

### Task 1: Migration 0011 + schema

Two small tables rather than one two-state table:

```sql
-- A Telegram chat bound to a member. chat_id is TEXT: Telegram ids are int64.
CREATE TABLE telegram_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  created_ts BIGINT NOT NULL,
  last_memo_ts BIGINT
);
CREATE INDEX idx_telegram_chat_user ON telegram_chat(user_id);

-- One-time link codes; short-lived and deleted on use.
CREATE TABLE telegram_link_code (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_ts BIGINT NOT NULL,
  expires_ts BIGINT NOT NULL
);
```

Rehearse against a seeded pre-0011 DB (cascade + second boot no-op).

### Task 2: Config + `storeAttachment` extraction

- `config.ts`: `telegram: { botToken: string } | null` from `NEMOMEMO_TELEGRAM_BOT_TOKEN`.
- Extract `services/attachment-service.ts`: `storeAttachment(db, config, { creatorId, filename, type, bytes }, { ocr, transcribe })` → `AttachmentRow`, holding the cloud storage-cap check, disk write, row insert, and OCR/transcribe enqueue. `routes/attachments.ts` calls it (behavior unchanged; existing tests are the proof).

### Task 3: The bot service (TDD, fake fetch)

`services/telegram.ts` exports:
- `handleTelegramMessage(db, config, deps, message): Promise<string | null>` — the whole decision tree, pure enough to test without any polling.
- `startTelegramBot(db, config, deps)` — the getUpdates loop; persists the update offset in `instance_setting` (`TELEGRAM_OFFSET`) so a restart can't replay and duplicate memos; 25s long poll, 5s backoff on error, `stop()` for tests.

Behavior, one test each:
- `/start`, `/help` → instructions, no memo
- `/link CODE` → binds; wrong/expired/used code → friendly refusal, no binding
- a code is single-use and expires (15 min)
- unlinked chat sends text → hint, no memo
- linked chat sends text → memo with the user's default visibility, `#tags` extracted into payload
- photo → attachment + memo (caption as content), OCR enqueued
- voice → audio attachment, transcription enqueued
- `/unlink` → binding gone; later messages refused
- one chat maps to at most one member; re-linking moves it
- an archived member's chat is refused

### Task 4: Link routes + instance profile

- `GET /users/-/telegram` → `{ enabled, linked, linkedTs }`
- `POST /users/-/telegram/link-code` → `{ code, expiresTs }` (session-only; replaces any outstanding code)
- `DELETE /users/-/telegram` → unlink (session-only)
- 404/400 when the instance has no bot configured.
- `InstanceProfileDto.telegramEnabled` so the web hides the card entirely when unset.

### Task 5: Web — Settings → Access

- Rename the `tokens` section tab to **Access** (it now holds two ways in).
- Telegram card (only when `telegramEnabled`): unlinked → "Connect Telegram" button that mints a code and shows `/link CODE` with a copy button and the 15-minute expiry; linked → "Connected · since <date>" with **Disconnect**.

### Task 6: Smoke, docs, release

- Unit-level smoke is the suite; browser smoke covers minting a code and the linked/unlinked card states (a real Telegram round-trip needs David's own bot token, so leave that as an optional manual step and say so).
- Docs in the SAME release: `.env.example` block, `deploy.mdx` env table + a "Capture from Telegram" section with the @BotFather walkthrough, and **the privacy note** — messages pass through Telegram's servers and are not end-to-end encrypted.
- `pnpm release minor` (v1.31.0) → push → poll demo → live-verify the card is hidden on demo (no bot token there) → handoff memory (next: PWA + share target).
