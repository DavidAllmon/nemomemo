# Memo Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-tap memo skeletons in the compose box — four reef-voiced built-ins (daily journal, standup, meeting note, recipe) plus custom templates saved per member, stored like saved views.

**Architecture:** Custom templates live in `user_setting` under a new `MEMO_TEMPLATES` key (exact `memoViews` pattern — no migration). The compose editor gains a Template dropdown: built-ins + the member's own, applied into the editor (`{date}` token → today's local date); "Save as template…" captures the current draft. Server work is a thin settings wire-through.

**Tech Stack:** Existing stack; no new deps, no migration, no new ACL surface (templates are the member's own settings).

**Spec:** `docs/ROADMAP.md` § Wave 3 "Memo templates".

## Global Constraints

- Green only; `pnpm release minor` two-run flow; push; poll demo; live-verify.
- Templates render through the normal create path — `buildPayload` sees the final markdown, nothing special server-side.
- Reef voice for built-ins and dialogs.

---

### Task 1: Shared schema + server settings (TDD)

- `shared/src/schemas/index.ts`: `memoTemplateSchema = { id: min1, title: 1–64, content: 1–CONTENT_LENGTH_LIMIT }`; `updateUserSettingsRequestSchema` gains `memoTemplates: array(memoTemplateSchema).max(20).optional()`; export `MemoTemplateDto`.
- `server/src/services/settings.ts`: `getMemoTemplates`/`setMemoTemplates` under key `MEMO_TEMPLATES` (mirror the memoViews pair).
- `server/src/routes/users.ts`: `/-/settings` GET returns `memoTemplates`; PATCH accepts them.
- Tests (`server/src/test/user-settings.test.ts`): roundtrip persists; fresh account reads `[]`; 21 templates → 400; empty title → 400.

### Task 2: Web — Template menu in the compose box

- `web/src/lib/templates.ts`: `BUILT_IN_TEMPLATES` (journal/standup/meeting/recipe, markdown with `{date}` tokens) + `applyTemplate(content: string): string` replacing `{date}` with the local date (browser-local, consistent with the time-travel rule).
- `web/src/components/editor/TemplatesMenu.tsx`: dropdown button (LayoutTemplate icon) listing custom templates (with per-row delete) then built-ins; selecting calls `onApply(applyTemplate(t.content))`; "Save as template…" item (enabled when the editor has content) opens a name dialog and saves via `useUpdateUserSettings` (`crypto.randomUUID()` id).
- `web/src/components/editor/MemoEditor.tsx`: render `TemplatesMenu` in the bottom control row for new top-level memos only (not edits/comments); apply = empty editor → `setMarkdown(content)`, else append `\n\n` + content; then focus.

### Task 3: Smoke, docs, release

- Browser smoke: apply a built-in into the empty compose box, save a custom template from a draft, apply + delete it; check the dropdown at ~700px viewport.
- Docs: memos.mdx "Writing" area gains a templates paragraph.
- `pnpm release minor` (v1.28.0) → push → poll demo → live-verify → handoff memory (next: editor polish).
