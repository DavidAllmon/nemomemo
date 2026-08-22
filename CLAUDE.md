# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deep context (read what the task needs)

This file is the compact index; the deep dives live in **`docs/claude/`** — start at
`docs/claude/README.md` for the reading map. In short: `MAP.md` (where everything
lives: routes, services, components), `DATA-MODEL.md` (tables, payload JSON,
migrations), `GOTCHAS.md` (invariants that fail silently — read before writing code),
`WORKFLOWS.md` (release/test/deploy procedures). The repo is also indexed in the
codebase-memory MCP as project `nemomemo` — prefer `search_graph`/`trace_path`/
`get_code_snippet` over grep for structural questions; re-index after large refactors.

## Commands

```bash
pnpm install               # workspace install (pnpm monorepo)
pnpm dev                   # app dev: API on :5230 (tsx watch), web on :5173 (Vite, proxies /api and /file)
pnpm dev:site              # marketing/docs site on :4321 (Next.js)
pnpm test                  # all vitest suites (shared + server + web markdown-bridge fidelity)
pnpm typecheck             # strict tsc across all packages
pnpm build                 # production build: web dist + bundled server (tsup)

# Single test file / single test:
pnpm --filter @nemomemo/server exec vitest run src/test/dory.test.ts
pnpm --filter @nemomemo/shared exec vitest run src/filter/parser.test.ts -t "parses tag"

# Docker (the app image contains ONLY shared/server/web — never site/):
docker build -t nemomemo . && docker run -d -p 5230:5230 -v nemomemo-data:/app/data nemomemo
```

Server tests run each file against a fresh in-memory SQLite via `makeTestApp()` in
`server/src/test/helpers.ts` and hit routes with `app.request()` — no port, no mocks.
Env knobs: `NEMOMEMO_PORT`, `NEMOMEMO_DATA`, `DORY_TTL_SECONDS` (set to e.g. 60 to watch
Dory memos expire quickly), `NEMOMEMO_WEB_DIST` (production static serving).

## Architecture

Four workspace packages; `shared` is the keystone:

- **`shared/`** — zod request schemas + response DTO types, the **filter-expression
  parser** (`src/filter/`), and **markdown extraction** (`src/markdown/extract.ts`).
  Both server and web import this so extraction/rendering/validation can never drift.
  The server bundles it in via tsup (`noExternal`), so shared's npm deps must also be
  declared in `server/package.json`.
- **`server/`** — Hono + Drizzle + better-sqlite3. Session-cookie auth (opaque token,
  SHA-256 in `user_session`; no JWT). Routes are thin; logic lives in `src/services/`.
- **`web/`** — React 19 + Vite + Tailwind v4 + TanStack Query v5. No Redux/Zustand:
  server state is Query, filter state lives in the URL, three small contexts
  (viewer/theme/view-setting).
- **`site/`** — Next.js + Fumadocs marketing site + docs (mirrors usememos.com's stack).
  Deployed separately; self-hosters never install it. Docs are MDX in
  `site/content/docs/`. Its static export requires `output: 'export'` to keep working.

### Load-bearing design decisions

- **`memo.payload` is a derived index, never authoritative.** On every content write,
  `buildPayload()` (one remark AST walk in shared) extracts tags (with implied
  ancestors: `a/b` ⇒ `a`, `a/b`), mentions, and `has_*` booleans into JSON that SQL
  queries via `json_extract`/`json_each`. If you change extraction, existing payloads
  are stale until rewritten.
- **One filter grammar everywhere.** `shared/src/filter/parser.ts` (CEL-subset → AST)
  is used by the web for validation and by `server/src/services/filter-sql.ts` to
  compile parameterized SQL. URL chips (`?filter=tagSearch:x,displayTime:YYYY-MM-DD`)
  are a separate, memos-compatible mini-format in `web/src/lib/filter-chips.ts` that
  compiles down to the grammar — keep all three in sync when adding filter fields.
- **Access control is two pure functions in `server/src/services/acl.ts`** and nothing
  else: `checkMemoRead` (used by the JSON API *and* the raw file server — an attachment
  can never out-scope its memo) and `canGlimpseMemo` (for memos embedded in something
  else: relation stubs, inbox snippets). Any new surface that exposes memo content must
  route through one of these. Dory expiry is enforced *inside* `checkMemoRead`
  (including expired parents; share tokens don't resurrect expired memos).
- **Comments are memos** with a `COMMENT` row in `memo_relation`; they inherit the
  parent's visibility at read time, die with the parent, and can't be Dory memos.
  Feed queries exclude them with a `NOT EXISTS` on that relation.
- **Dory memos**: `memo.forget_at` epoch + a 60s `setInterval` sweeper
  (`services/dory-sweeper.ts`). Every read path must carry the
  `forget_at IS NULL OR forget_at > now` guard — grep for it when adding queries.
  Rules: pinned ⟂ dory (mutually exclusive), archiving clears `forget_at` ("rescue").
- **Migrations are hand-rolled**, not drizzle-kit: numbered `.sql` files in
  `server/src/db/migrations/` applied at boot inside a transaction, tracked in
  `schema_migration`. A schema change = new migration file **plus** matching edits to
  `db/schema.ts`. The build copies migrations into `dist/`.
- **Route ordering matters** in `server/src/routes/users.ts`: the `/-/...` viewer
  routes must stay registered before `/:username`.
- **Interactive checkboxes splice the raw markdown source**: a rehype plugin in
  `web/src/components/memo/MemoContent.tsx` stamps each checkbox with its parent
  `li`'s source offset (the checkbox hast node itself has no position), and
  `toggleTaskAt` from shared rewrites exactly `[ ]`↔`[x]` — never re-serialize the AST.
- **Theming**: OKLCH CSS variables in `web/src/index.css` ("Shallows" light /
  "Deep Sea" dark via `data-theme` + `prefers-color-scheme`). Semantic Tailwind tokens
  (`bg-ocean`, `text-dory`, …) via `@theme inline`. Animations sit behind
  `prefers-reduced-motion` guards.

### Voice

User-facing copy stays in the reef voice — playful, never at the expense of clarity:
"This memo swam away" (404), "Just keep swimming" (empty states), Dory phrasing for
ephemerality. Error messages say what happened and what to do next, then the fish.

## Versioning & changelog

Canonical version = root `package.json`, mirrored into `shared/src/version.ts`
(`NEMOMEMO_VERSION`, generated — never hand-edit) by `pnpm release [patch|minor|major]`.
**Every push to main that touches app code (`shared/`, `server/`, `web/`, `Dockerfile`)
must go through `pnpm release`** — it scaffolds `docs/changelog/vX.Y.Z.md` on first run,
then (once filled) bumps, commits `release: vX.Y.Z`, and tags; push with
`git push --follow-tags`. A pre-push hook (`git config core.hooksPath scripts/hooks`)
enforces this; site/docs-only pushes are exempt. Changelog entries need BOTH sections:
"What's new" in plain everyday language (no jargon — see `docs/changelog/README.md`)
and "Technical notes" for developers. The marketing site renders only "What's new" at
/changelog (build reads `docs/changelog/`, copied in by `Dockerfile.site`); the app's
About page links there.

## Deployment reality

Pushing to `main` auto-deploys the maintainer's self-hosted instance (a poller pulls
every ~3 minutes and rebuilds only the changed service — `site/` vs app paths), so
**every push to main goes live within ~4 minutes**. The public demo's content is seeded
from `deploy/seed-demo.mjs` and reset nightly at 09:00 UTC — demo-data changes ship by
editing that file and pushing. Don't commit secrets, private IPs, or credentials; this
repo is public.

### Cloud mode (`NEMOMEMO_CLOUD=1`)

`server/src/cloud/` is the hosted multi-tenant layer (spec: `docs/CLOUD-PLAN.md`,
ops: `docs/CLOUD-OPS.md`): a registry DB (`data/registry.db`) plus one full
app+SQLite instance per reef (`data/reefs/<slug>/`), resolved by Host header, LRU-cached.
The tenant app is cloud-unaware — cloud-only routes (`/api/v1/cloud/*`, checkout/claim/
webhook on the app host) live in the cloud router, and billing switches on only when all
four `STRIPE_*` env vars are set. **Ship-dark rule: cloud code must never change
single-tenant behavior or break the existing suite**; cross-tenant isolation tests in
`server/src/test/cloud-isolation.test.ts` are the guarantee — extend them when adding
any cloud surface. Stripe is test-mode only until the live flip in CLOUD-OPS.md.

## Current state

`docs/AUDIT-2026-08-22.md` holds the latest audit (fixed findings + a ranked
simplification backlog); `docs/ROADMAP.md` holds the feature brainstorm organized by
user job. Check both before proposing refactors or features. `docs/CLOUD-PLAN.md` is
the approved spec for the paid hosted version; phases 1–4 are implemented (tenancy,
billing/claim, cloud UX, marketing/legal — marketing gated behind
`NEXT_PUBLIC_CLOUD_URL`), phase 5 infra is scripted in `deploy/cloud-vm-setup.sh` +
`deploy/backup-cloud.sh` pending the maintainer's hands.
