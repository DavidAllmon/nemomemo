# Gotchas & invariants — read before writing code

Everything here has bitten (or nearly bitten) a change at least once. Violating these
usually produces *silently wrong* behavior, not a test failure — that's why they're
written down.

## Data & queries

- **`memo.payload` is a derived index, never authoritative.** `buildPayload()` in
  shared (one remark AST walk) extracts tags (with implied ancestors: `a/b` ⇒ `a` and
  `a/b`), mentions, and `has_*` booleans into JSON on every content write. SQL reads it
  via `json_extract`/`json_each`. If you change extraction logic, every existing row's
  payload is stale until rewritten — a migration or backfill is required, not optional.
- **Every memo read path needs the Dory guard**: `forget_at IS NULL OR forget_at > now`.
  When adding any new query that returns memo rows, grep for that expression and copy
  the pattern. Missing it = expired memos leak until the 60s sweeper deletes them
  (and the sweeper only deletes; reads must not depend on it).
- **Dory rules**: pinned and Dory are mutually exclusive; archiving clears `forget_at`
  ("rescue"); comments can't be Dory memos; share tokens do NOT resurrect expired memos
  (expiry is enforced inside `checkMemoRead`, including via expired parents).
- **Comments are memos** with a `COMMENT` row in `memo_relation`. They inherit the
  parent's visibility *at read time*, die with the parent, and feed queries exclude
  them via `NOT EXISTS` on that relation. A new feed-like query must do the same or
  comments show up as top-level memos.
- **Migrations are hand-rolled** (numbered `.sql` in `server/src/db/migrations/`,
  applied at boot in a transaction, tracked in `schema_migration`). A schema change =
  new migration file **plus** matching edit to `db/schema.ts` — they don't sync
  automatically. Never edit an already-shipped migration. The build copies migrations
  into `dist/`; forget that and production boots against a missing file.

## Access control

- **All memo exposure routes through `server/src/services/acl.ts`** — two pure
  functions and nothing else: `checkMemoRead` (JSON API *and* the raw file server, so
  an attachment can never out-scope its memo) and `canGlimpseMemo` (embedded contexts:
  relation stubs, inbox snippets). Any new surface that exposes memo content —
  including indirect surfaces like counts, search results, or exports — must call one
  of these. Do not inline visibility checks.

## Server

- **Route ordering matters** in `server/src/routes/users.ts`: the `/-/...` viewer
  routes must stay registered before `/:username`, or usernames shadow them.
- **shared is bundled into the server via tsup `noExternal`** — any npm dependency
  shared uses must ALSO be declared in `server/package.json`, or the production bundle
  breaks while dev (tsx) works fine.
- **bcryptjs runs on the event loop** and in cloud mode one process serves all reefs —
  auth endpoints are the DoS surface. Rate limiting (audit F3) exists for this reason;
  don't add new unauthenticated bcrypt/expensive paths.

## Filter system (three layers to keep in sync)

Adding a filter field touches all three, or the feature is inconsistent:
1. `shared/src/filter/parser.ts` — the CEL-subset grammar → AST (used by web for
   validation).
2. `server/src/services/filter-sql.ts` — compiles that AST to parameterized SQL.
3. `web/src/lib/filter-chips.ts` — the memos-compatible URL mini-format
   (`?filter=tagSearch:x,displayTime:YYYY-MM-DD`) that compiles down to the grammar.

## Web

- **Interactive checkboxes splice the raw markdown source** — never re-serialize the
  AST. The rehype plugin in `web/src/components/memo/MemoContent.tsx` stamps each
  checkbox with its parent `li`'s source offset (the checkbox hast node has no
  position), and `toggleTaskAt` from shared rewrites exactly `[ ]`↔`[x]`.
- **No Redux/Zustand**: server state is TanStack Query, filter state lives in the URL,
  three small contexts (viewer/theme/view-setting). Don't introduce a store.
- **Theming**: OKLCH CSS variables in `web/src/index.css` ("Shallows" light / "Deep
  Sea" dark via `data-theme` + `prefers-color-scheme`); semantic tokens (`bg-ocean`,
  `text-dory`) via `@theme inline`. New colors go through variables, not hex literals.
  Animations sit behind `prefers-reduced-motion` guards.

## Cloud / business (paying customers exist)

- **Push to main deploys to production in ~4 minutes** — including paying customers'
  reefs. Only push green states; the full suite + typecheck must pass first.
- **Ship-dark**: cloud code never changes single-tenant behavior. Extend
  `server/src/test/cloud-isolation.test.ts` when adding any cloud surface.
- **Billing switches on only when all four `STRIPE_*` env vars are set**; cloud-only
  routes live in the cloud router, not the tenant app.
- **Stripe webhooks are scoped to the nemomemo-cloud app** — the Stripe account is
  shared with the maintainer's other products. Preserve the scoping; never touch
  livemode objects without explicit approval.
- **License is Elastic 2.0, not MIT.** Say "free to self-host" / "source-available",
  never "open source".
- **This repo is public.** No secrets, private IPs, credentials, or customer data in
  code, docs, comments, or commit messages. Operational secrets live in the
  maintainer's private notes and on the VM.

## Voice

User-facing copy stays in the reef voice — playful, never at the expense of clarity.
Error messages: what happened, what to do next, *then* the fish. ("This memo swam
away", "Just keep swimming", Dory phrasing for ephemerality.)
