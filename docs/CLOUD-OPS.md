# NemoMemo Cloud — ops runbook

How the hosted service (docs/CLOUD-PLAN.md) is deployed and operated. The cloud ships
dark: nothing here affects self-hosters or the demo.

## Environment contract (server, cloud container only)

| Variable | Meaning | Default |
|---|---|---|
| `NEMOMEMO_CLOUD` | `1` enables cloud mode (multi-reef + registry) | off |
| `NEMOMEMO_CLOUD_DOMAIN` | reefs live at `<slug>.<domain>` | `trynemomemo.com` |
| `NEMOMEMO_CLOUD_APP_HOST` | portal host (checkout/claim/webhook) | `app.<domain>` |
| `NEMOMEMO_CLOUD_APP_URL` / `_CANCEL_URL` | absolute URLs used in Stripe redirects | `https://<appHost>` / `https://<domain>/pricing` |
| `NEMOMEMO_CLOUD_MAX_OPEN_REEFS` | LRU cap on open reef DB handles | 64 |
| `NEMOMEMO_CLOUD_MAX_MEMBERS` / `_MAX_STORAGE_GB` | fair-use brakes per reef | 25 / 5 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY_ID`, `STRIPE_PRICE_YEARLY_ID` | billing switches on only when **all four** are set | billing off |

Marketing site: `NEXT_PUBLIC_CLOUD_URL` (build-time) reveals the Cloud pricing tier and
CTAs. Unset = the site shows self-host only.

Data layout inside the cloud volume: `registry.db` (reefs + claim tokens) and
`reefs/<slug>/{nemomemo.db,uploads/}`. Per-reef backup/export is a file copy; deleting a
churned reef is `rm -rf` after the 90-day grace.

## VM setup (one-time)

```bash
ssh root@192.168.1.187
bash /opt/nemomemo/deploy/cloud-vm-setup.sh   # adds the `cloud` compose service on :5231
```

Idempotent; backs up compose/update.sh before patching. After it runs, pushes to main
rebuild `demo`, `cloud`, and `site` per the usual path rules.

## Launch checklist (test mode)

1. **Cloudflare wildcard** (dashboard → Zero Trust → Networks → Tunnels): on the tunnel
   of your choice add public hostnames `app.trynemomemo.com` → the VM app-cloud port
   (`:5231`, same service-URL style as the demo's) and `*.trynemomemo.com` → same target.
   Note: a wildcard public hostname does **not** auto-create DNS — add a `*` CNAME record
   pointing at `<tunnel-id>.cfargotunnel.com` in the trynemomemo.com zone.
2. **Stripe keys** (test mode, acct Techitdave): Developers → API keys → copy the test
   secret key into `/opt/nemomemo-deploy/cloud.env`.
3. **Stripe webhook** (test mode): Developers → Webhooks → Add endpoint
   `https://app.trynemomemo.com/cloud/webhook/stripe` with events
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.deleted`; copy the signing secret into `cloud.env`; then
   `docker compose -f /opt/nemomemo-deploy/docker-compose.yml up -d cloud`.
4. **Backups** (required before live keys): pick an off-VM restic destination
   (Backblaze B2 is ~$0 at this size), fill `/opt/nemomemo-deploy/backup.env`, run
   `restic init`, install the cron line — all documented in `deploy/backup-cloud.sh`.
5. **Uptime monitoring** (required before live keys): external monitor (UptimeRobot /
   healthchecks.io) on `https://app.trynemomemo.com/healthz`, the demo, and the site;
   plus the backup script's `HEALTHCHECK_URL` ping.
6. **Test-mode walkthrough**: pricing page → checkout with card `4242 4242 4242 4242` →
   claim a reef → sign in, write memos, invite a member → Settings → Billing → portal →
   cancel → verify past-due/suspended behavior → (optionally) delete the test reef.

## Going live (only after David's explicit go)

1. Repeat product/price creation in **live mode** (same lookup keys), create the live
   webhook endpoint, swap `cloud.env` to live keys, restart the cloud container.
2. Rebuild the site with `NEXT_PUBLIC_CLOUD_URL=https://app.trynemomemo.com` to reveal
   the pricing tier and CTAs.
3. Confirm: backups restoring (do one `restic restore` fire drill), uptime alerts firing
   (pause the container once), refund path known (Stripe dashboard → payment → refund).

## Snapshot browser / self-serve rollback

The app lists nightly snapshots from `snapshots.json` in the cloud volume (written by
`backup-cloud.sh`; run `deploy/backfill-snapshot-manifest.sh` once to fill history).
Restores are a file-queue handshake in `<volume>/restore/`:
`queue/<slug>.json` (app) → `restore-cloud.sh` cron (host, every minute, logs to
`/opt/nemomemo-deploy/restore.log`) restic-restores + integrity-checks into
`staged/<slug>/` → the app's 10 s sweeper evicts the reef, keeps one
`reefs/<slug>.pre-restore-<ts>` safety copy, and swaps the restore in.
`status/<slug>.json` carries the state machine (queued → restoring → staged → done,
or failed with a message). Restic creds stay in `backup.env`, host-only.

Troubleshooting: a request stuck in `restoring` for >15 min → check `restore.log`;
a crashed worker leaves `queue/<slug>.json.working`, which the next cron run
requeues automatically. To undo a restore: the safety copy is
`reefs/<slug>.pre-restore-<ts>` — just move it to `restore/staged/<slug>` and the
sweeper swaps it back in.

## Recovering a customer's claim link

Stripe dashboard → Customers → the customer → metadata `nemomemo_claim_url`.


## Deploy pipeline hardening (2026-08-22 incident)

A day of releases filled the VM disk with Docker build cache (28.8 GB); the
poller's build failed AFTER `git reset --hard`, so every later run saw
HEAD == origin/main and exited silently — deploys wedged with no log line.
`update.sh` on the VM now:

- compares origin/main against `deployed.rev` (the last SUCCESSFUL deploy),
  so failed builds retry on the next tick instead of wedging;
- logs a `FAILED old=… new=…` line via an ERR trap (never silent again);
- runs `docker builder prune -f --keep-storage 6g` after each deploy.

Old script kept at `update.sh.bak-predisk`. Still open (roadmap): post-deploy
smoke test + alerting; uptime monitoring will catch a stuck version externally.


## Monitoring — LIVE since 2026-08-23 (Better Stack)

One free Better Stack account covers everything; all of the below EXISTS and
is verified up. API token + version-monitor id live in
`/opt/nemomemo-deploy/betterstack.env` on the VM (never in this repo).

**Uptime monitors** (alert when a probe FAILS):
- `https://app.trynemomemo.com/healthz`   (cloud portal + tenant supervisor)
- `https://demo.trynemomemo.com/healthz`  (demo app / app image)
- `https://trynemomemo.com`               (marketing site)
- `https://david.trynemomemo.com/healthz` (a real reef → wildcard tunnel path)
- Optional: keyword monitor on `https://demo.trynemomemo.com/api/v1/instance/profile`
  expecting the released `"version"` (catches a wedged deploy — 2026-08-22 incident).

**Heartbeats** (alert when an expected ping DOESN'T arrive):
- "nemomemo-backup", period 1 day, grace 3 h → put the heartbeat URL in
  `/opt/nemomemo-deploy/backup.env` as `HEALTHCHECK_URL=…` (backup-cloud.sh
  already pings it on success).
- Optional: "demo-reset", period 1 day, grace 2 h → append
  `curl -fsS -m 10 --retry 3 <heartbeat-url>` to reset-demo.sh.

**Version canary is self-updating**: update.sh PATCHes the keyword monitor to
the freshly deployed version after every successful deploy, so a wedged deploy
(prod serving an old version) trips a DOWN alert within minutes. Heartbeat
URLs are wired: backup.env `HEALTHCHECK_URL` (backup) and a curl at the end of
reset-demo.sh (demo reset). New customer reefs need NO new monitors — every
reef shares the container/tunnel the customer-reef canary already probes.
