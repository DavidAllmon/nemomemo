# 🐠 NemoMemo

**Write it down. Tag it. Share it. Or let Dory forget it.**

[![License: ELv2](https://img.shields.io/badge/license-Elastic%202.0-blue.svg)](LICENSE)
[![Self-host free](https://img.shields.io/badge/self--host-%240%20forever-orange.svg)](site/content/docs)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

NemoMemo is a cute, self-hosted memo timeline — a playful, ocean-themed recreation of the
excellent open-source [Memos](https://usememos.com) project, with one new trick:
**Dory memos** forget themselves 24 hours after you write them.

**Website & docs:** [trynemomemo.com](https://trynemomemo.com) ·
**Live demo:** [demo.trynemomemo.com](https://demo.trynemomemo.com)

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
- **Password:** `justkeepswimming`

The public demo resets every 24 hours and reloads a full sample reef — shared lists,
notes between accounts, live Dory memos, an inbox with mentions waiting for you — so you
can freely create, edit, comment, react, and let Dory forget things.

## Install NemoMemo (the app)

One command. The install script checks for Docker (and tells you exactly what to do if
it's missing), pulls the image (amd64 + arm64, app only — no marketing site inside),
starts it with a persistent data volume, and waits for your reef to answer.

**Linux & macOS:**

```bash
curl -fsSL https://trynemomemo.com/install.sh | sh
```

**Windows** (PowerShell, with Docker Desktop):

```powershell
irm https://trynemomemo.com/install.ps1 | iex
```

Open **http://localhost:5230**, create your account (the first one becomes the admin),
and start writing. Re-running the same command later **upgrades in place** — new image,
same data. The scripts are short and live right here in the repo
([`install.sh`](install.sh) / [`install.ps1`](install.ps1)) — read them first if piping
to a shell isn't your thing, or use plain Docker:

```bash
docker run -d --name nemomemo --restart unless-stopped \
  -p 5230:5230 \
  -v nemomemo-data:/app/data \
  ghcr.io/davidallmon/nemomemo:latest
```

All data — one SQLite database plus your uploads — lives in the `/app/data` volume.
Full guide: [Getting started](https://trynemomemo.com/docs/getting-started)
· [Deploy](https://trynemomemo.com/docs/deploy).

### One-click cloud deploy

NemoMemo needs a host with a persistent volume (it's SQLite + uploads on disk):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/DavidAllmon/nemomemo)
&nbsp;
[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/DavidAllmon/nemomemo&branch=main&builder=dockerfile&name=nemomemo)

Render is preconfigured by [`render.yaml`](render.yaml) (Docker service + 1 GB disk at
`/app/data`, health check). On Koyeb, attach a volume at `/app/data` after the first
deploy so data survives redeploys.

<details>
<summary>Build it yourself / run from source</summary>

```bash
git clone https://github.com/DavidAllmon/nemomemo.git && cd nemomemo

# Docker:
docker build -t nemomemo . && docker run -d -p 5230:5230 -v nemomemo-data:/app/data nemomemo

# Or bare Node (22+) with pnpm:
pnpm install --filter '!@nemomemo/site'   # app only, skips the website
pnpm build
NEMOMEMO_WEB_DIST=web/dist node server/dist/index.js
```
</details>

## Develop locally

```bash
pnpm install
pnpm dev          # API on :5230, web app with hot reload on :5173
```

Open http://localhost:5173 — same first-account-becomes-admin flow.

## Configuration

Nothing is required — NemoMemo runs with no configuration at all. Everything optional
lives in one env file, and [**`.env.example`**](.env.example) is the annotated list:
every setting with its default, commented out, grouped by what it turns on (email,
image text search, voice transcripts, live dictation).

```bash
cp .env.example .env      # then uncomment what you want
```

Apply it with `--env-file .env` (Docker), `env_file: [.env]` (Compose),
`NEMOMEMO_ENV_FILE=.env` (install script), or `set -a; . ./.env; set +a` (source).
Full reference with prose for each feature:
[Deploy → Configuration](https://trynemomemo.com/docs/deploy#configuration).

> Docker users: leave `NEMOMEMO_DATA`, `NEMOMEMO_PORT` and `NEMOMEMO_WEB_DIST` alone —
> the image sets them, and repointing `NEMOMEMO_DATA` writes your memos outside the
> mounted volume. Change the port *mapping* instead.

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

NemoMemo is **free to self-host, forever** — the full source is here under the
[Elastic License 2.0](LICENSE): run it, read it, modify it, fork it, no paid tiers, no
strings. The one thing the license reserves is selling NemoMemo to others as a hosted or
managed service — that's [NemoMemo Cloud](https://trynemomemo.com/pricing), which keeps
the lights on. Bug reports, docs fixes, features, and forks are all welcome: see
[CONTRIBUTING.md](CONTRIBUTING.md) to get set up.

## License & credits

[Elastic License 2.0](LICENSE) © David Allmon and NemoMemo contributors — free to
self-host and modify; not for resale as a hosted service.

Lovingly modeled on [usememos/memos](https://github.com/usememos/memos) (MIT) — go star it.
NemoMemo is an independent recreation with a fish obsession, not an official fork.

*Just keep swimming.* 🫧
