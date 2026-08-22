# Contributing to NemoMemo 🐠

Thanks for swimming by! NemoMemo is free, MIT-licensed, and open to contributions of
every size — bug reports, docs fixes, features, or a full fork you take in your own
direction. All of it is welcome and encouraged.

## Ways to help

- **Report a bug** — open an issue with what you did, what you expected, and what happened.
- **Improve the docs** — they're plain markdown in [`site/content/docs/`](site/content/docs/).
- **Fix or build something** — grab an issue (or open one to discuss an idea first if it's
  big), then send a pull request.
- **Fork it** — genuinely fine. The [Elastic License 2.0](LICENSE) lets you take NemoMemo
  anywhere you want for your own use, no permission needed — the one reserved right is
  reselling it to others as a hosted service.

## Development setup

You need Node 22+ and pnpm.

```bash
git clone https://github.com/<you>/nemomemo
cd nemomemo
pnpm install
git config core.hooksPath scripts/hooks   # release guard (maintainers)
pnpm dev        # API on :5230, web app on :5173
```

Open http://localhost:5173 — the first account you create becomes the admin.
`pnpm dev:site` runs the marketing/docs site on :4321 if you're working on that.

## Project layout

| Package | What it is |
| --- | --- |
| `shared/` | Zod schemas, the filter-expression parser, markdown extraction — pure logic used by both sides |
| `server/` | Hono + Drizzle + better-sqlite3 REST API, file serving, the Dory sweeper |
| `web/` | React 19 + Vite + Tailwind v4 app (CodeMirror editor, TanStack Query) |
| `site/` | The website (Next.js + Fumadocs) — separate from the app; self-hosters never install it |

## Before you open a PR

```bash
pnpm test         # vitest — filter engine, markdown, API, ACL, Dory sweeper
pnpm typecheck    # strict TypeScript across all packages
pnpm build        # production build must pass
```

A few conventions:

- New behavior gets a test, especially anything touching the filter engine, access
  control, or Dory rules.
- Keep the playful voice in user-facing copy ("just keep swimming"), and keep it out of
  error messages' way — clarity first, fish second.
- Small, focused PRs land fastest.

## Credits

NemoMemo is lovingly modeled on [usememos/memos](https://github.com/usememos/memos).
If you like this project, go star that one too.
