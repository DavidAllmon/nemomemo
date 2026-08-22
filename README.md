# 🐠 NemoMemo

**Write it down. Tag it. Share it. Or let Dory forget it.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Free forever](https://img.shields.io/badge/price-%240%20forever-orange.svg)](site/content/docs)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

NemoMemo is a cute, self-hosted memo timeline — a playful, ocean-themed recreation of the
excellent open-source [Memos](https://usememos.com) project, with one new trick:
**Dory memos** forget themselves 24 hours after you write them.

## Features

- ✍️ **Frictionless capture** — open, type Markdown, save. Tasks, code blocks, tables,
  images, and inline `#tags` (nested like `#dev/git`) all render beautifully.
- 🐟 **Dory memos** — mark a memo as a Dory memo and it fades away over its final hours,
  then vanishes for good at the 24-hour mark. Perfect for parking spots, one-day reminders,
  and thoughts that don't need to live forever. Archiving a Dory memo rescues it.
- 🔍 **Filters everywhere** — one filter language for search chips, saved sidebar views,
  and the API: `tag in ["work"] && has_incomplete_tasks`, `content.contains("TODO")`,
  `created_ts >= now - duration("24h")`, and more — with a Validate button.
- 👥 **Multi-user reef** — private / protected / public visibility, an Explore feed,
  profiles, comments, emoji reactions, `@mentions` with an inbox, and admin member management.
- 🔗 **Share links** — expiring tokenized links (1/7/30 days or never) that open a memo for
  anyone, even on private reefs.
- 📎 **Attachments** — paste or drop files into the editor; browse everything in the
  attachment library with unused-file cleanup.
- 📆 **Calendar heatmap**, pin/archive, ⌘K search, list/grid layouts, and two hand-mixed
  themes: **Shallows** (light) and **Deep Sea** (dark).

## Try the hosted demo

Open **https://demo.trynemomemo.com** and sign in with:

- **Username:** `demo`
- **Password:** `demo`

The public demo database resets every 24 hours and is automatically reloaded with sample
memos, so you can freely create, edit, comment, react, and try Dory memos.

## Install NemoMemo (the app)

This is all you need to self-host. The Docker image contains **only the app** — no
marketing site, no docs site.

```bash
docker build -t nemomemo .
docker run -d -p 5230:5230 -v nemomemo-data:/app/data nemomemo
```

Open **http://localhost:5230**, create your account (the first one becomes the admin),
and start writing. All data — one SQLite database plus your uploads — lives in the
`/app/data` volume.

<details>
<summary>Prefer to run from source?</summary>

```bash
pnpm install --filter '!@nemomemo/site'   # app only, skips the website
pnpm build
NEMOMEMO_WEB_DIST=web/dist node server/dist/index.js
```

Then open http://localhost:5230.
</details>

## Develop locally

```bash
pnpm install
pnpm dev          # API on :5230, web app with hot reload on :5173
```

Open http://localhost:5173 — same first-account-becomes-admin flow.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEMOMEMO_PORT` | `5230` | HTTP port |
| `NEMOMEMO_DATA` | `./data` | Data directory (SQLite DB + uploads) |
| `DORY_TTL_SECONDS` | `86400` | How long Dory remembers (lower it to watch her forget) |
| `NEMOMEMO_WEB_DIST` | — | Path to the built SPA (production) |

Instance-level settings (public mode, sign-ups, reaction set, reef name) live in
**Settings → Reef** once you're signed in as admin.

## Marketing site + docs (separate — you don't install this)

The `site/` directory is nemomemo's own website: the landing page, features/use-cases/
compare/pricing pages, blog, and documentation — the equivalent of usememos.com, built on
the same stack (Next.js + Fumadocs). It is **not part of the app**: self-hosters never
install or run it, the Docker image excludes it, and the documentation source is plain
markdown you can read right here on GitHub at [`site/content/docs/`](site/content/docs/).

To work on the website itself (or host your own copy of it somewhere like Vercel or
Cloudflare):

```bash
pnpm dev:site     # http://localhost:4321
```

"Try the demo" buttons point at a running app — set `NEXT_PUBLIC_DEMO_URL` to your
public instance when deploying the site.

## Development

```bash
pnpm test         # vitest: filter engine, markdown extraction, API + ACL + Dory sweeper
pnpm typecheck    # strict TS across all packages
pnpm build        # production build (web + bundled server)
```

The monorepo has three packages: `shared/` (zod schemas, the filter parser, markdown
extraction — used by both sides), `server/` (Hono + Drizzle + better-sqlite3), and
`web/` (React 19 + Vite + Tailwind v4 + CodeMirror).

## Contributing

NemoMemo is **free and open source, forever** — MIT licensed, no paid tiers, no strings.
Bug reports, docs fixes, features, and forks are all welcome: see
[CONTRIBUTING.md](CONTRIBUTING.md) to get set up. If you'd rather take the code in your
own direction, fork away — that's what the license is for.

## License & credits

[MIT](LICENSE) © David Allmon and NemoMemo contributors.

Lovingly modeled on [usememos/memos](https://github.com/usememos/memos) (MIT) — go star it.
NemoMemo is an independent recreation with a fish obsession, not an official fork.

*Just keep swimming.* 🫧
