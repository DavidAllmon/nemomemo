# docs/claude/ — deep context for AI-assisted development

This directory is the extended memory for Claude Code (and any other AI agent) working
on NemoMemo. `CLAUDE.md` at the repo root is the compact index that loads every
session; these files are the deep dives it points to. Read what the task needs:

| Task shape | Read |
| --- | --- |
| "Where does X live / what handles Y?" | [MAP.md](MAP.md) — file-by-file codebase map, route table, service inventory |
| Touching the database, payload JSON, or a query | [DATA-MODEL.md](DATA-MODEL.md) — every table, the payload shape, migration list |
| Writing/changing any code | [GOTCHAS.md](GOTCHAS.md) — invariants and traps that are easy to violate silently |
| Releasing, testing, deploying, demo data | [WORKFLOWS.md](WORKFLOWS.md) — step-by-step procedures |
| Cloud/multi-tenant work | `docs/CLOUD-PLAN.md` (spec) + `docs/CLOUD-OPS.md` (operations) — canonical, not duplicated here |
| What to build next | `docs/ROADMAP.md` — the prioritized post-launch roadmap (keep ✅ marks current) |
| Known code-health debt | `docs/AUDIT-2026-08-22.md` |

## The two-product mental model (internalize this first)

NemoMemo is **one codebase, two distributions**:

1. **Self-hosted** (free, source-available under Elastic 2.0 — never call it "open
   source"): a user runs the Docker image themselves. Single tenant, single SQLite DB.
2. **NemoMemo Cloud** ($1.99/mo / $19/yr): we host it. Exists purely for convenience —
   same app, but a user clicks "Get your reef" on trynemomemo.com, pays via Stripe
   Checkout, and gets `<their-slug>.trynemomemo.com` without touching a server.
   Implementation: `NEMOMEMO_CLOUD=1` starts a multi-tenant supervisor
   (`server/src/cloud/`) that runs one full app+SQLite instance per paying customer
   ("reef"), resolved by Host header.

**Ship-dark rule**: the tenant app is cloud-unaware. Cloud code must never change
single-tenant behavior — the self-host build stays byte-identical, and
`server/src/test/cloud-isolation.test.ts` is the gate.

## Other memory layers (how they fit together)

- **`CLAUDE.md`** — always-loaded compact index. Keep it short; deep material goes here.
- **`docs/claude/*` (this dir)** — deep reference, checked in, public-safe. **Never put
  secrets, credentials, private IPs, or customer data here — the repo is public.**
- **codebase-memory MCP** (knowledge graph) — the repo is indexed as project
  `nemomemo`. Use `search_graph` / `trace_path` / `get_code_snippet` for structural
  questions (callers, call chains, symbol lookup) before grepping. Re-index after big
  refactors with `index_repository`.
- **Claude auto-memory** (`~/.claude/projects/.../memory/`) — private, per-machine.
  Holds infrastructure access details, session handoffs, credentials pointers. Things
  that must not be committed live there, not here.

## Maintenance rules

- These docs describe **what is**, not what's planned (plans → ROADMAP.md).
- When a change invalidates a statement here, fix the doc in the same commit — a wrong
  map is worse than no map.
- MAP.md and DATA-MODEL.md are regenerable summaries; if they drift badly, rebuild
  them from the source rather than patching around errors.

Last full refresh: 2026-08-22 (v1.2.1).
