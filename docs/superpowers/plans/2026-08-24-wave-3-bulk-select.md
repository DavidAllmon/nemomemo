# Bulk Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-select memos in your own feeds (Home, Archived) and act on them at once: archive/unarchive, add a tag, move to trash — one transactional endpoint, History-covered where content changes.

**Architecture:** One creator-only `POST /api/v1/memos/bulk` (`{uids, action, tag?}` → `{affected}`) processing up to 100 memos in a single transaction; non-owned/trashed/expired rows are skipped, not errors. Tag-add rewrites content (append `\n\n#tag`) with `captureRevision()` per memo — same rule as rename. Web: selection mode inside `MemoFeed` (cards click-toggle with a ring, sticky action bar at the bottom of the scroller), enabled only on Home + Archived.

**Tech Stack:** Existing stack; no new deps, no migration.

**Spec:** `docs/ROADMAP.md` § Wave 3 "Bulk select" + handoff note: bulk delete is soft (trash), bulk content edits capture revisions.

## Global Constraints

- Green only, `pnpm release minor` two-run flow, `git push --follow-tags`, poll demo, live-verify.
- Bulk ops are creator-only (admins moderate per-memo, never in bulk).
- Archive rescues Dory (clears `forget_at`); trash takes comments along and never extends an existing trash clock; every content rewrite captures a revision first.
- `/bulk` is a static path — register it BEFORE the `/:uid` routes in memos.ts.
- Reef voice for dialogs; confirm destructive bulk trash.

---

### Task 1: Shared schema

- Modify `shared/src/schemas/index.ts`:

```ts
export const bulkMemoRequestSchema = z.object({
  uids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['archive', 'unarchive', 'trash', 'tag']),
  /** Required when action = 'tag'. */
  tag: z.string().min(1).max(128).optional(),
});
```

### Task 2: Server route (TDD)

- Test `server/src/test/bulk.test.ts`:
  - archive: archives own NORMAL memos, clears `forget_at` (Dory rescue), returns affected; already-archived skipped
  - unarchive restores to NORMAL
  - skips other users' memos silently (affected counts only own)
  - trash: memo + its comments get `deleted_at`; re-trashing keeps the original clock (affected 0 the second time)
  - tag: appends `\n\n#tag`, payload tags updated, ONE revision per changed memo holding prior content; memos already carrying the tag (implied ancestors included) skipped without a revision
  - tag with invalid name (`a//b`) or missing tag → 400; >100 uids → 400
  - trashed and Dory-expired memos are skipped by archive/tag
- Implement in `routes/memos.ts` (before `/:uid` routes, near /trash): load `inArray(memos.uid, uids) AND creatorId = viewer.id`, single `db.$client.transaction`, per-action logic as specced (tag-existence check via `extractProps(content).tags.includes(tag)`; append `#tag` alone when content is empty). Response `{ affected }`.

### Task 3: Web — selection mode + action bar

- `web/src/hooks/queries.ts`: `useBulkMemoAction()` mutation (POST /bulk, `onSuccess` → `useInvalidateMemos()`).
- `web/src/components/memo/MemoFeed.tsx`: `selectable?: boolean` prop. When set and memos exist: a right-aligned ghost "Select" button above the grid toggles selection mode; in mode, each card's wrapper `onClickCapture` toggles membership (prevents inner clicks), selected cards get `ring-2 ring-ocean`; a `sticky bottom-4` bar shows count + **Archive**/**Unarchive** (by `params.state`), **Add tag…** (dialog with input, validated non-empty), **Move to trash** (confirm dialog: "N memos and their comments wait in the trash for 7 days."), **Cancel**. Any completed action clears selection and exits mode.
- Pages: pass `selectable` from `Home.tsx` and `Archived.tsx` only.

### Task 4: Smoke + release

- Browser smoke: select 2 memos → tag both (chips appear, History shows revision), archive both (vanish from Home, appear in Archived), unarchive from Archived, bulk trash → Trash page shows them; short-viewport sanity (sticky bar inside `main`, no document scroll).
- Docs: memos.mdx gains a "Acting on many memos at once" paragraph (no env vars).
- `pnpm release minor` (v1.27.0, both sections) → push → bg-poll demo → live-verify → update handoff memory (next: memo templates).
