# Workflows — how work ships

Step-by-step procedures. Commands assume the repo root.

## Daily development

```bash
pnpm install               # workspace install (pnpm monorepo)
pnpm dev                   # API :5230 (tsx watch) + web :5173 (Vite proxies /api, /file)
pnpm dev:site              # marketing/docs site :4321 (Next.js) — separate product
```

- Dev seed logins: all passwords `justkeepswimming`; admin is `reefkeeper`, plus
  `david`, `demo`, and personas `coral`/`nemo`/`dory`/`marlin`.
- Env knobs: `NEMOMEMO_PORT`, `NEMOMEMO_DATA`, `DORY_TTL_SECONDS` (set 60 to watch
  Dory memos expire fast), `NEMOMEMO_WEB_DIST` (production static serving),
  `NEMOMEMO_CLOUD=1` (multi-tenant supervisor).
- After a self-host restore in dev, tsx watch does NOT auto-restart — rerun `pnpm dev`.

## Testing & verification (before any push)

```bash
pnpm typecheck             # strict tsc, all packages
pnpm test                  # all vitest suites (shared + server; web has none)
pnpm build                 # production build: web dist + bundled server (tsup)

# One file / one test:
pnpm --filter @nemomemo/server exec vitest run src/test/dory.test.ts
pnpm --filter @nemomemo/shared exec vitest run src/filter/parser.test.ts -t "parses tag"
```

Server tests: each file gets a fresh in-memory SQLite via `makeTestApp()`
(`server/src/test/helpers.ts`) and hits routes with `app.request()` — no port, no
mocks. Cloud isolation lives in `src/test/cloud-isolation.test.ts` and must be
extended for any new cloud surface.

## Release (required for every app-code push to main)

Any push touching `shared/`, `server/`, `web/`, or `Dockerfile` must go through
`pnpm release` — a pre-push hook enforces it (`git config core.hooksPath scripts/hooks`
per clone). Site/docs-only pushes are exempt.

1. `pnpm release [patch|minor|major]` — first run scaffolds
   `docs/changelog/vX.Y.Z.md`.
2. Fill BOTH changelog sections: **"What's new"** in plain everyday language (no
   jargon — see `docs/changelog/README.md`; it renders publicly at
   trynemomemo.com/changelog) and **"Technical notes"** for developers (repo-only).
3. Run `pnpm release` again — it validates, bumps root `package.json`, regenerates
   `shared/src/version.ts` (`NEMOMEMO_VERSION` — generated, never hand-edit), commits
   `release: vX.Y.Z`, and tags.
4. `git push --follow-tags`.

## Deployment reality (why green-only matters)

- A poller on the maintainer's VM pulls main every ~3 minutes and rebuilds only the
  changed service (`site/` vs app paths). **Every push to main is live in ~4 minutes**
  — on the demo, the marketing site, AND paying customers' cloud reefs.
- The public demo reseeds nightly at 09:00 UTC from `deploy/seed-demo.mjs` — demo-data
  changes ship by editing that file and pushing.
- Cloud operations (backups, reef lifecycle, Stripe): `docs/CLOUD-OPS.md`. Cloud
  architecture/spec: `docs/CLOUD-PLAN.md`.
- Docker: the app image contains ONLY shared/server/web — never `site/`
  (`Dockerfile.site` is the marketing site's image).

## Docs & roadmap hygiene

- `docs/ROADMAP.md` is the authoritative prioritized to-do list — mark items ✅ when
  they ship, add new findings to the right priority band.
- Feature work should check ROADMAP.md and `docs/AUDIT-2026-08-22.md` first — the
  backlog item or a known conflict may already exist.
- Keep `docs/claude/` truthful in the same commit that changes behavior it describes.
