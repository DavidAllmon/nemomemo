# WYSIWYG editor over markdown storage — design

Date: 2026-08-22 · Status: SHIPPED in v1.6.0 · Target: web package only

## Problem

The composer, edit-in-place, and comment box show raw markdown while typing
(`**bold**`, `- [ ]`). David wants what-you-see-is-what-you-get everywhere,
including comments.

## Non-negotiable constraint

**Markdown stays the storage format.** `buildPayload()` extraction, the filter
grammar, `toggleTaskAt` source-splicing, share/render paths, and every existing
memo depend on it. The editor becomes a *view*: it parses markdown into a rich
document on open and serializes back to markdown on save. No server, schema, or
shared-package changes.

## Decisions (approved)

- Library: **TipTap** (ProseMirror) + a markdown bridge (parse + serialize).
- Markdown input shortcuts stay live (`# `, `**bold**`, `- ` auto-format).
- Comment box: same editor with a **slim toolbar** (bold/italic/strike, list,
  code); main composer keeps the full toolbar.
- `@member` / `#tag` autocomplete insert **plain text** (no custom ProseMirror
  nodes) — serialization can't mangle what is ordinary text.
- Display side unchanged (`MemoContent` still renders saved markdown).

## Components

- `web/src/lib/markdown-bridge.ts` — `markdownToDoc(md)` / `docToMarkdown(doc)`
  plus escaping fixes. The single point of round-trip truth.
- `web/src/components/editor/RichEditor.tsx` — TipTap wrapper: toolbar variant
  (`full` | `slim`), placeholder, Cmd+Enter submit, @/# suggestion popups,
  paste/drop upload hook, imperative `getMarkdown()` / `setMarkdown()` /
  `insertText()`.
- `MemoEditor` and `CommentEditor` keep their chrome (visibility/Dory/
  attachments; private-mention hint) and swap CodeMirror for `RichEditor`.

## Fidelity engineering (the "no mistakes" part)

1. **Bridge test suite first** (vitest added to the web package — its first
   tests): round-trip cases covering everything `extractProps` understands:
   tags (incl. `#tag` at line start — serializers escape leading `#` as `\#`,
   which would break tag extraction; the bridge must prevent that), mentions,
   nested tags, task lists checked/unchecked, code blocks/inline code (tags in
   code must stay literal), links, bold/italic/strike, ordered/unordered lists,
   headings, blockquotes, and the seed-demo corpus.
2. **Extraction equivalence**: for each case, `extractProps(original)` ≈
   `extractProps(roundTripped)` (tags, mentions, task counts identical).
3. **No phantom edits**: saving without changes must not rewrite content — the
   editor compares serialized output with what it loaded and skips the content
   field if equal, so canonicalization noise never marks a memo "edited".
4. Length limit enforced on the serialized markdown (same 8 KiB rule).

## Out of scope

Slash commands, tables, collaborative editing, changing MemoContent rendering.

## Rollout

One minor release. Verify: bridge tests, typecheck, build, local browser pass,
then live production pass (compose, edit old memo unchanged-save, comment,
checkbox toggle, @/# popups, image paste).
