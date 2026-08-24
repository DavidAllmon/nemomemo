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
  the pattern. Missing it = expired memos leak until the sweeper deletes them
  (and the sweeper only deletes; reads must not depend on it).
- **Every memo query needs the trash guard too** (since v1.24.0):
  `deleted_at IS NULL`. Unlike the bottle guard this one hides the memo from its
  **creator** as well — `/memos/trash` queries `deleted_at` directly instead. It lives
  in `buildMemoListWhere` and in BOTH `acl.ts` functions, so anything routed through
  those inherits it; hand-rolled WHEREs do not (the comments query needed it added by
  hand). `server/src/test/trash.test.ts` walks 17 read paths — extend it when you add
  a surface. The hard delete itself is `purgeMemos()` in `services/purge.ts`, the one
  cascade shared by permanent delete, the Dory sweep, and the trash sweep;
  `memo_revision` rows ride along via FK cascade.
- **Edit history is creator-only AND behind `checkMemoRead`** (since v1.25.0):
  `/memos/:uid/history` + restore must never leak a hidden memo's old text — trash,
  Dory expiry, and pending bottles all apply. Any code path that rewrites
  `memo.content` outside PATCH/restore must decide explicitly whether to
  `captureRevision()` first (`services/revision-service.ts`) — a silent rewrite
  is invisible in history.
- **Feed queries need the bottle guard too** (since v1.15.0):
  `surface_at IS NULL OR surface_at <= now`. A pending bottle is hidden from EVERY
  feed — including the owner's (that's the feature; the owner finds it on /dory).
  Both guards live side by side in `listMemoRows`; grep for either when adding queries.
- **Dory rules**: pinned and Dory are mutually exclusive; archiving clears `forget_at`
  ("rescue"); comments can't be Dory memos; share tokens do NOT resurrect expired memos
  (expiry is enforced inside `checkMemoRead`, including via expired parents).
- **Bottle rules** (message in a bottle, `surface_at`): a pending bottle
  (`surface_at > now`) is creator-only in `checkMemoRead`/`canGlimpseMemo` — share
  tokens do NOT reveal it; pinned ⟂ bottle; comments can't be bottles; dory+bottle
  allowed only when `forget_at > surface_at` (`assertTimeRules` enforces all three).
- **The scheduler is the reef's one clock** (`services/scheduler.ts`, minute tick):
  surfaces bottles (BOTTLE_ARRIVED), fires reminders (REMINDER + optional email;
  recurring `remind_every` advances with single-nudge catch-up), warns in the final
  hour (DORY_WARNING, deduped via NOT EXISTS on inbox), runs the dory sweep (which
  bumps `user.dory_forgotten_count` and skips trashed memos), purges the expired
  end of the trash, then prunes edit-history revisions (keep 20 per memo / 90 days).
  Six passes, one tick — new time-based work belongs here, not in another interval.
- **Comments are memos** with a `COMMENT` row in `memo_relation`. They inherit the
  parent's visibility *at read time*, die with the parent, and feed queries exclude
  them via `NOT EXISTS` on that relation. A new feed-like query must do the same or
  comments show up as top-level memos.
- **Migrations are hand-rolled** (numbered `.sql` in `server/src/db/migrations/`,
  applied at boot in a transaction, tracked in `schema_migration`). A schema change =
  new migration file **plus** matching edit to `db/schema.ts` — they don't sync
  automatically. Never edit an already-shipped migration. The build copies migrations
  into `dist/`; forget that and production boots against a missing file.

## Email identity (since v1.8.0)

- Signup REQUIRES email everywhere; email uniqueness is enforced in the routes
  (app layer, case-insensitive), not by a DB index. Sign-in accepts username or
  a uniquely-matching email. Legacy accounts may have '' — never force-clear.
- All outbound mail goes through the injected `Mailer` (`services/email.ts`);
  request paths use `trySend` (fire-and-forget) so SMTP trouble never breaks a
  request. `NEMOMEMO_SMTP_*` env unset ⇒ mailer null ⇒ every email feature
  degrades silently (this is the self-host-without-mail mode; keep it working).

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

- **Editors are WYSIWYG views over markdown** (TipTap v3 + `@tiptap/markdown`).
  All parse/serialize goes through `web/src/lib/markdown-bridge.ts`; its test suite
  is the fidelity contract (byte-stable round trips, extraction equivalence). Never
  serialize through any other path, and run the bridge tests after ANY TipTap
  upgrade. Editors send markdown to the API exactly as before — the server never
  knows WYSIWYG exists. No-op saves skip the content field (no phantom "edited").

- **Interactive checkboxes splice the raw markdown source** — never re-serialize the
  AST. The rehype plugin in `web/src/components/memo/MemoContent.tsx` stamps each
  checkbox with its parent `li`'s source offset (the checkbox hast node has no
  position), and `toggleTaskAt` from shared rewrites exactly `[ ]`↔`[x]`.
- **The app shell scrolls `main`, never the document.** `AppShell` is a full-height
  flex row: the `aside` is fixed height and `main` is the only scroller. Two ways to
  break that, both silent and both already have:
  1. An **absolutely-positioned descendant of `main`** escapes its overflow clip unless
     `main` is a containing block — that's why `main` carries `relative`. Tailwind's
     `sr-only` is `position: absolute`, so an innocuous visually-hidden element inside
     a memo card stretched `documentElement.scrollHeight` to the last card's bottom and
     the whole page scrolled, sidebar included. Keep `relative` on `main`; for hidden
     click targets prefer `hidden` (`HTMLElement.click()` fires on `display: none`).
  2. **Sidebar content outgrowing the viewport.** Only the brand row and the account
     row are `shrink-0`; everything between them lives in one `min-h-0 flex-1
     overflow-y-auto` scroller. Adding a fixed-height section *outside* that scroller
     eats the space the scroller needs, and `Sidebar`'s `overflow-hidden` will clip
     the account menu (Settings / Sign out) off the bottom rather than scroll it.
  jsdom does no layout, so neither is unit-testable — check in a real browser at a
  short viewport (~700px tall) after touching either component.
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
