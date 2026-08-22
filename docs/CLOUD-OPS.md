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


## Monitoring setup (the two free accounts)

Two accounts, both free tier, both needing the maintainer's hands (sign-up):

**1. UptimeRobot** (uptimerobot.com — free: 50 monitors, 5-min checks).
Create four HTTP(S) monitors, alerts to the maintainer's email:
- `https://app.trynemomemo.com/healthz`  (cloud portal + tenant supervisor)
- `https://demo.trynemomemo.com/healthz` (demo app; also proves the app image)
- `https://trynemomemo.com`              (marketing site)
- `https://david.trynemomemo.com/healthz` (a real reef → proves the wildcard
  tunnel + host routing path paying customers use)
Optional keyword monitor: `https://demo.trynemomemo.com/api/v1/instance/profile`
containing the expected `"version"` after releases (catches a wedged deploy —
see the 2026-08-22 incident above).

**2. Healthchecks.io** (healthchecks.io — free: 20 checks). Dead-man switches
for cron jobs — alerts when an expected ping DOESN'T arrive:
- Check "nemomemo-backup", period 1 day, grace 3 h. Put its ping URL in
  `/opt/nemomemo-deploy/backup.env` as `HEALTHCHECK_URL=…` —
  `deploy/backup-cloud.sh` already pings it on success (line ~42).
- Optional: check "demo-reset", period 1 day, grace 2 h; append a
  `curl -fsS -m 10 --retry 3 <ping-url>` to `/opt/nemomemo-deploy/reset-demo.sh`.

Once the accounts exist, hand the two ping URLs to the assistant/session with
VM access and it can wire them in.
