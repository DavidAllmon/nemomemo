# Changelog

One file per release, named `vX.Y.Z.md` (copy `_template.md`). Files here are the
canonical release record; `pnpm release` refuses to ship a version without one.

## Format

```md
---
version: 1.0.0
date: 2026-08-22
---

## What's new
- Plain-language bullets.

## Technical notes
- Developer detail.
```

Both sections are required. The marketing site renders **only "What's new"** at
[trynemomemo.com/changelog](https://trynemomemo.com/changelog); "Technical notes" stays
here for developers.

## Writing "What's new"

It's read by everyday people — reef members, not developers.

- Lead with what the reader can now do or stops suffering: "Sharing a memo now works on
  your phone", not "Fixed mobile share dialog z-index".
- No internals: never mention APIs, databases, flags, dependencies, or file names.
- Reef voice welcome, clarity first. One bold lead phrase per bullet is the house style:
  `- **Dory got gentler.** Memos now fade out over their final hour instead of vanishing.`
- If a release is purely internal, say so honestly: "Housekeeping under the sea — nothing
  you'll notice, just a tidier reef."

"Technical notes" is the opposite: precise, conventional, aimed at whoever debugs this in
two years. Subsystems, migrations, env vars, breaking changes all belong there.
