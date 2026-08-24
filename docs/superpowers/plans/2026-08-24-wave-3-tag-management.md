# Tag Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings → Tags: rename a tag everywhere (with History coverage), merge it into an existing tag, and give it a per-user color shown in chips and the sidebar — with exactly ONE tag tokenizer across shared/web/server.

**Architecture:** The tokenizer dedupe ships first (shared exports `TAG_REGEX`/`MENTION_REGEX`/`isValidTagName`; web + server consume them). The existing `POST /users/-/tags/rename` grows revision capture (per David 2026-08-24: tag renames DO write revisions — it's the support story) and strict target validation; merge is rename-onto-existing, confirmed in the UI. Colors are a fixed 8-name reef palette in shared constants, stored per user in `userGeneralSettingSchema.tagColors` (no migration), painted via new OKLCH variables.

**Tech Stack:** Existing stack only — zod, Hono, better-sqlite3, React, OKLCH CSS variables. No new deps, no migration.

**Spec:** `docs/ROADMAP.md` § Wave 3 "Tag management" + code-health #1 in the same doc; David's decision: renames capture revisions.

## Global Constraints

- Green only before push: `pnpm typecheck && pnpm test && pnpm build`; then `pnpm release minor` (two runs, both changelog sections) + `git push --follow-tags`.
- New colors go through CSS variables (light `:root` + Deep Sea blocks), never hex literals in components.
- Reef voice; merge copy must say nothing is lost (History keeps the old words).
- TDD server-first; web vitest only for pure lib logic.
- No new env vars ⇒ `.env.example`/`deploy.mdx` untouched; user-facing docs page updated in the same release.

---

### Task 1: One tokenizer (shared exports, web + server consume)

**Files:**
- Modify: `shared/src/markdown/extract.ts` (export `TAG_REGEX`, `MENTION_REGEX`, add `isValidTagName`)
- Modify: `shared/src/index.ts` if extract exports aren't re-exported already (check)
- Modify: `web/src/components/memo/MemoContent.tsx` (delete local copies, import from shared)
- Modify: `server/src/routes/users.ts` (validation via `isValidTagName`)
- Test: `shared/src/markdown/extract.test.ts` (or wherever extract tests live)

**Interfaces:**
- Produces: `export const TAG_REGEX`, `export const MENTION_REGEX` (both `g`-flagged, safe for `matchAll` only — document that), `export function isValidTagName(name: string): boolean` (anchored, strict grammar: `^[\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_][\p{L}\p{N}_-]*)*$`).

- [ ] Failing shared tests: `isValidTagName` accepts `reef`, `reef/notes`, `héllo`, `a-b_c`; rejects `''`, `a/`, `a//b`, `-a`, `a b`, `#a`.
- [ ] Implement + export; swap MemoContent's local `TAG_REGEX`/`MENTION_REGEX` for the shared imports; swap users.ts's loose `/^[\p{L}\p{N}_][\p{L}\p{N}_/-]*$/u` for `isValidTagName` (stricter on `a/`, `a//b` — deliberate fix).
- [ ] `pnpm test` + typecheck green (markdown-bridge fidelity suite guards the web swap). Commit `refactor: one tag/mention tokenizer, exported from shared`.

### Task 2: Rename captures revisions + strict validation (TDD)

**Files:**
- Modify: `server/src/routes/users.ts` (rename route)
- Test: `server/src/test/tag-management.test.ts` (new)

**Interfaces:**
- Consumes: `captureRevision(db, memoId, content, now)` from `services/revision-service.js`; `isValidTagName` from shared.
- Produces: unchanged response shape `{ changed: number }`.

- [ ] Failing tests:
  - rename rewrites content + payload tags on the owner's memos, and each rewritten memo gains ONE revision holding the pre-rename content (assert via `/memos/:uid/history`)
  - untouched memos (no such tag) gain no revision
  - other users' memos untouched
  - invalid target (`a/`, `a//b`, `-a`) → 400
  - merge: renaming `#a` onto existing `#b` combines counts in `GET /users/-/tags` and leaves no `#a`
  - descendant rewrite still works (`#a` → `#b` also rewrites `#a/x`), revisions included
- [ ] Implement: inside the existing per-memo transaction loop, call `captureRevision(db, memo.id, memo.content, nowSeconds())` before each update. Validation via `isValidTagName(to)` (same reef-voiced error).
- [ ] Suite green. Commit `feat(server): tag rename writes edit-history revisions + strict target validation`.

### Task 3: Tag colors — shared palette + per-user setting (TDD)

**Files:**
- Modify: `shared/src/constants.ts` (`TAG_COLOR_NAMES`), `shared/src/schemas/index.ts` (`tagColors` on `userGeneralSettingSchema`)
- Test: `server/src/test/tag-management.test.ts` (settings roundtrip)

**Interfaces:**
- Produces: `export const TAG_COLOR_NAMES = ['ocean', 'coral', 'kelp', 'sand', 'dory', 'anemone', 'urchin', 'teal'] as const; export type TagColor = (typeof TAG_COLOR_NAMES)[number]`; schema field `tagColors: z.record(z.string().min(1).max(128), z.enum(TAG_COLOR_NAMES)).refine((o) => Object.keys(o).length <= 200, 'Too many colored tags').default({})`.

- [ ] Failing tests: `PATCH /users/-/settings {general:{tagColors:{reef:'coral'}}}` persists and echoes back via GET; invalid color name → 400; legacy stored settings (no field) parse to `{}`.
- [ ] Implement. Suite green. Commit `feat(shared): per-user tag colors in user settings`.

### Task 4: Web — chips and sidebar wear the colors

**Files:**
- Modify: `web/src/index.css` (tag palette variables, light + both dark blocks)
- Create: `web/src/lib/tag-colors.ts` (name → className map)
- Modify: `web/src/components/memo/MemoContent.tsx` (chip uses viewer's color), `web/src/components/layout/TagTree.tsx` (`#` glyph color)

**Interfaces:**
- Produces: `tagChipClass(color: TagColor | undefined): string` and `tagGlyphClass(color: TagColor | undefined): string`; CSS vars `--tag-<name>` / `--tag-<name>-soft` for the six new names (ocean/dory reuse existing tokens).

- [ ] Add OKLCH pairs (light ≈ L .50 fg / .93 soft bg; Deep Sea ≈ L .75 fg / .28 soft bg; hues: coral 40, kelp 150, sand 90, anemone 350, urchin 300, teal 190) in `:root`, the `prefers-color-scheme` guard block, and the `[data-theme="dark"]` block — same tri-state pattern as the existing tokens. Expose as Tailwind utilities via the existing `@theme inline` section.
- [ ] MemoContent: read `useUserSettings(!!viewer)`; chip class = `tagChipClass(settings?.general.tagColors[tag])` with the current ocean look as default. TagTree: `#` glyph + active row tint via `tagGlyphClass`. Memoize the lookup map.
- [ ] Typecheck + build green; verify both themes in the browser later (Task 6). Commit `feat(web): tag chips and sidebar in the member's colors`.

### Task 5: Settings → Tags section (rename / merge / color)

**Files:**
- Modify: `web/src/pages/Settings.tsx` (new `'tags'` section; DELETE the old "Rename a tag" card from Preferences)
- Modify: `web/src/hooks/queries.ts` (`useRenameTag` mutation wrapping the existing inline call)

Behavior: section lists the member's tags (from `useTags`, sorted by count) — each row: colored `#name`, count, an 8-dot color picker (click = save via `useUpdateUserSettings`, current dot ringed, plus a "default" clear), and a Rename control (inline input). If the target name equals an existing tag → the button reads **Merge** and a confirm dialog explains: "#to already has N memos. Merging pours every #from memo into it — each rewritten memo keeps its old words in History, so nothing is lost." Success flashes "Renamed in N memo(s)" / "Merged into #to — N memo(s) rewritten"; invalidates `['memos']` + tags + settings. Empty state: "No tags yet — write #something and it'll swim up here."

- [ ] Implement section + hook; remove the Preferences card.
- [ ] `pnpm typecheck && pnpm test && pnpm build` green. Commit `feat(web): Settings → Tags — rename, merge, and colors in one place`.

### Task 6: Browser smoke (chrome-devtools MCP)

- [ ] `pnpm dev`: Settings → Tags lists tags; pick a color → chip in feed + sidebar `#` change, both themes; rename a tag → feed + sidebar update, memo ⋯ → History shows the pre-rename words; merge flow shows the confirm and combined counts; short-viewport (~700px) sidebar check (Settings is inside `main`).

### Task 7: Docs, release, live-verify

- [ ] Docs: memos.mdx (or the page where tags are documented — check `site/content/docs/`) gains a short "Tags" management paragraph: rename/merge/colors, renames covered by History. No env vars ⇒ deploy.mdx/.env.example untouched.
- [ ] `pnpm release minor` run 1 → fill `docs/changelog/v1.26.0.md` (both sections) → run 2 → `git push --follow-tags`.
- [ ] Bg-poll demo profile until 1.26.0; live-verify rename+history+color on demo. Update handoff memory (Wave 3: next = bulk select).
