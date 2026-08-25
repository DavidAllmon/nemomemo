# Personal Access Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bearer-token auth for scripts, Shortcuts, and bots — hashed tokens with two scopes (create-only vs full), managed from Settings, shown once at creation.

**Architecture:** New `access_token` table (migration 0010) mirroring `user_session`'s opaque-token + SHA-256 design. `viewerMiddleware` gains a second resolver: session cookie first, then `Authorization: Bearer nm_…`. A token's scope rides the request in a new `tokenScope` context variable; a small `requireScope`-style guard blocks anything a token must never do. **Tokens are strictly less powerful than a session** — they can never manage tokens, change the account, or act as admin, so a leaked token can't escalate into an account takeover.

**Tech Stack:** Existing stack only — Hono middleware, better-sqlite3, drizzle, React. No new deps.

**Spec:** `docs/ROADMAP.md` § Wave 4 "Personal access tokens" (prereq for Telegram bot, PWA share target, webhooks).

## Global Constraints

- Green only; `pnpm release minor` two-run flow; push; poll demo; live-verify.
- **New auth surface on an app with paying customers** — every deny path gets a test.
- SHA-256, not bcrypt: tokens are 256-bit random, and GOTCHAS forbids adding expensive unauthenticated paths (bcrypt on the event loop is the DoS surface).
- Migration = new numbered `.sql` + `db/schema.ts` edit; rehearse against a seeded pre-0010 DB.
- Cloud ships dark: extend `cloud-isolation.test.ts` so a token from reef A can never read reef B.
- Docs: admin.mdx (managing tokens) + api.mdx (using them) in the same release.

---

### Task 1: Migration 0010 + schema + rehearsal

**Files:** create `server/src/db/migrations/0010_access_tokens.sql`; modify `server/src/db/schema.ts`.

```sql
-- Personal access tokens: bearer auth for scripts, Shortcuts, and bots.
-- Same opaque-token design as user_session (SHA-256 of a random string; the
-- plaintext is shown once at creation and never stored).
CREATE TABLE access_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  -- Keep in sync with accessTokenScopes in shared/src/constants.ts.
  scope TEXT NOT NULL DEFAULT 'FULL' CHECK (scope IN ('CREATE_ONLY', 'FULL')),
  created_ts BIGINT NOT NULL,
  last_used_ts BIGINT,
  expires_ts BIGINT
);

CREATE INDEX idx_access_token_user ON access_token(user_id);
```

Drizzle table `accessTokens` to match (`tokenHash` unique, `scope` enum, nullable `lastUsedTs`/`expiresTs`). Rehearse: apply 0001–0009, seed user+memo, boot `createDb`, assert table+index, FK cascade drops tokens with the user, second boot is a no-op.

### Task 2: Shared constants + schemas

- `constants.ts`: `ACCESS_TOKEN_SCOPES = ['CREATE_ONLY', 'FULL'] as const`; `type AccessTokenScope`; `ACCESS_TOKEN_PREFIX = 'nm_'`; `ACCESS_TOKEN_EXPIRY_PRESETS = { '30d': 30*86400, '90d': 90*86400, '1y': 365*86400, never: null }`.
- `schemas/index.ts`: `createAccessTokenRequestSchema = { name: 1–64, scope: enum default 'FULL', expiresIn: enum keys default 'never' }`; `AccessTokenDto { id, name, scope, createdTs, lastUsedTs, expiresTs }`; `CreateAccessTokenResponse { token: AccessTokenDto; plaintext: string }`.

### Task 3: Bearer resolution in the middleware (TDD)

**Files:** `server/src/middleware/auth.ts`; test `server/src/test/access-tokens.test.ts`.

- `AppEnv.Variables` gains `tokenScope: AccessTokenScope | null` (null = session/anonymous).
- `resolveTokenViewer(db, token)`: hash → row → not expired → user NORMAL; bumps `last_used_ts` at most hourly (the session-touch pattern). Returns `{ user, scope }`.
- `viewerMiddleware`: cookie path unchanged and **wins**; only when there's no valid session does it read `Authorization: Bearer …`.
- `requireSessionViewer(c)`: like `requireViewer` but 403s when `tokenScope != null` — the guard for token-management, account, and admin routes.
- Tests: valid token resolves; unknown/expired/malformed → anonymous; archived user's token → anonymous; token never overrides a valid session cookie; `last_used_ts` updates.

### Task 4: Scope enforcement + routes (TDD)

**Files:** `server/src/routes/tokens.ts` (new), `app.ts`, plus guards in `users.ts`/`auth.ts`.

Rules, each with a test:
- `CREATE_ONLY` may ONLY `POST /memos` and `POST /attachments`; every other authenticated route → 403 "This token can only write new memos".  Implement as one `app.use` on the API router that inspects method+path.
- **No token (any scope) may**: create/list/revoke tokens, PATCH `/users/-/account`, hit admin routes, or sign out — `requireSessionViewer` on those handlers.
- Routes: `GET /api/v1/tokens` (list, session-only), `POST /api/v1/tokens` (create, session-only, max 20/user, returns plaintext once), `DELETE /api/v1/tokens/:id` (revoke, session-only, own tokens only — another user's id → 404).
- Also: a FULL token CAN read/write memos, comment, react, and use bulk actions (assert one of each).
- Extend `cloud-isolation.test.ts`: a token minted in reef A returns anonymous in reef B.

### Task 5: Web — Settings → Tokens

- `queries.ts`: `useAccessTokens`, `useCreateAccessToken`, `useRevokeAccessToken`.
- New `'tokens'` section in Settings: list (name, scope pill, created, last used or "never used", expiry), a create dialog (name + scope radio + expiry select), and the **one-time reveal** — a copy-able code block with "This is the only time you'll see it" in reef voice. Revoke asks first ("Anything using it stops working immediately").
- Empty state: "No tokens yet — mint one to let a script drop memos into your reef."

### Task 6: Smoke, docs, release

- Browser smoke: mint a FULL token, copy it, `curl -H "Authorization: Bearer …" /api/v1/memos` creates a memo; mint a CREATE_ONLY token and confirm a GET is refused; revoke and confirm 401 after.
- Docs: **api.mdx** gains an authentication section (header format, scopes, curl examples); **admin.mdx** notes tokens are per-member and revocable. No env vars ⇒ `.env.example`/deploy.mdx untouched.
- `pnpm release minor` (v1.30.0) → push → poll demo → live-verify → handoff memory (next: Telegram capture bot).
