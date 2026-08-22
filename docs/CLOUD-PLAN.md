# NemoMemo Cloud — plan (2026-08-22, pre-implementation)

## What we're building

A hosted, paid version of NemoMemo at **app.trynemomemo.com**: $1.99/month or $19/year,
pay first (no trial), unlimited use. One deployment serves many customers, each with a
completely private **reef** — their own members, memos, Explore feed, tags, settings,
and admin — invisible to every other customer. Runs on the existing homelab VM alongside
the demo and marketing site. Stripe (the "Tech at Dave" account, doing business as
NemoMemo) handles billing, built end-to-end in **test mode first**.

## Decisions locked

- One shared deployment, NOT instance-per-customer, NOT one shared community.
- Pricing: **$1.99/mo + $19/yr** (annual ≈ 2 months free; also cuts Stripe's ~18%
  per-charge drag on the monthly price to ~4.5%).
- **Pay → provision → claim**: checkout happens before any account exists; the live
  demo is the try-before-you-buy.
- Stripe **test mode first**, flip to live only after we click through everything.

## Architecture: database-per-reef tenancy (recommended)

Two ways to make one app multi-tenant:

**A. Thread a `reef_id` column through every table and every query.** Classic, but it
touches the entire data layer, every ACL path we just audited, and every future query
forever. High blast radius; the single-tenant self-host code and the cloud code
diverge subtly everywhere.

**B. One SQLite database *per reef*, one registry database above them. ← chosen.**
The entire existing app already works perfectly against "a database" — so we give each
reef its own (`data/reefs/<slug>/nemomemo.db` + uploads dir) and add a thin tenancy
layer that picks the right database per request. The core schema, routes, services,
ACL, sweeper, and tests stay **byte-identical** for self-hosters (they simply run one
default reef, exactly as today). Isolation is file-level (a query physically cannot
cross reefs), per-reef backup/export is `cp`, and deleting a churned customer is
`rm -rf` after grace. This is the "keep the repo the same" answer.

### Components

1. **Registry DB** (`data/registry.db`, cloud mode only): `reef` (slug, status:
   provisioned|active|past_due|suspended|canceled, stripe_customer_id,
   stripe_subscription_id, created), `claim_token` (token, reef_id, expires, used).
2. **Tenancy middleware** (`server/src/cloud/`): resolves the reef from the request —
   **subdomain routing**: `coral.trynemomemo.com` → reef `coral` (wildcard DNS +
   wildcard Cloudflare Tunnel hostname → same VM port; one Node process serves all
   reefs via the Host header — no per-reef containers or ports). `app.trynemomemo.com`
   hosts the sign-up/claim/billing pages and a "find my reef" helper. A per-reef `Db`
   handle cache (LRU, lazily opened, migrations run on first open). Cloud mode is off
   unless `NEMOMEMO_CLOUD=1` — self-host behavior is untouched.
3. **Billing service** (same process, `/cloud/*` routes): Stripe Checkout session
   (two prices), success → webhook `checkout.session.completed` → create reef +
   claim token → redirect to claim page → customer picks their reef slug (subdomain)
   and creates the first admin account of *their* reef. Webhooks
   `invoice.payment_failed` / `customer.subscription.deleted` → reef `past_due`
   (banner + read-only after grace) → `suspended` (sign-in blocked, data retained
   90 days) → deletion. Stripe **customer portal** link in the reef's Settings for
   card updates/cancellation — we never build card UI ourselves.
4. **Fair-use guards** (cloud mode only): per-reef upload storage cap (e.g. 5 GB
   soft), max attachment size already 32 MiB, members cap high (e.g. 25) — "unlimited"
   in spirit, with abuse brakes we can raise. Documented on the pricing page.
5. **Marketing site**: pricing page gains the $1.99 tier ("We host it — your own
   private reef in 60 seconds") with the checkout link; header/hero gain a "Get
   NemoMemo Cloud" CTA next to the self-host path; **Terms of Service + Privacy
   Policy pages** (required by Stripe and basic decency).

## Money & risk — the honest part

- **Fee math**: $1.99/mo nets ≈ $1.63 after Stripe; $19/yr nets ≈ $18.15. Fine as a
  convenience price; this is a coffee-money product until it isn't.
- **Homelab SLA**: paying customers on a residential Proxmox box means *your power/ISP
  outage is their outage*. Mitigations in-plan: UPS if you have one, uptime monitoring
  with alerts, nightly off-VM backups of `data/reefs/` (non-negotiable before live
  mode). A future migration path to a $5 VPS keeps the same layout (`rsync` + tunnel
  move) if it ever earns its keep.
- **Obligations**: ToS/Privacy pages (in scope), refunds policy (recommend: 14-day
  no-questions via Stripe dashboard), Stripe Tax **off** at launch (US sales tax
  thresholds are far away at this price; revisit at volume). Chargebacks cost $15 —
  another reason annual + demo-first reduces surprise.
- **Support**: a support@ or GitHub Discussions link on the pricing page; expectations
  set as "community support".

## What I need from you (blocking items)

> Plan approved 2026-08-22; execution begins in a follow-up session. To clarify one
> line below: "Stripe Tax off" refers to Stripe's optional automatic *sales-tax
> collection* feature — Stripe payments/subscriptions themselves are of course on.

1. **Stripe access**: ✅ RESOLVED — the Stripe MCP is authorized in test mode (three
   same-named accounts were authorized; execution starts by confirming which is the
   primary). Still to confirm on that account: the public business display name
   ("NemoMemo") customers see on receipts.
2. **Wildcard DNS + tunnel**: one-time in Cloudflare — add a wildcard hostname
   (`*.trynemomemo.com`) to the existing tunnel pointing at the VM's app port. I'll
   give you the exact clicks (or do it myself if you add my SSH key's reach to a box
   with `cloudflared` access / API token).
3. **Decisions inside the plan you can veto**: reef slugs as subdomains
   (`coral.trynemomemo.com`) vs. everything under `app.trynemomemo.com/r/coral`
   (I recommend subdomains — cleaner, cookie-isolated per reef); 14-day refund policy;
   the fair-use numbers.

## Implementation phases (each verifiable, test mode throughout)

1. **Tenancy layer**: registry DB, host-based reef resolution, per-reef Db cache,
   `NEMOMEMO_CLOUD` flag; existing test suite must pass untouched in single-tenant
   mode; new tests: two reefs are fully invisible to each other (the cross-tenant ACL
   test matrix).
2. **Billing + claim flow**: Stripe products/prices (test), checkout, webhook handler
   (signed), claim page (slug picker + first-account), lifecycle states, customer
   portal link. Test-card E2E: pay → claim → use → cancel → suspend.
3. **Cloud UX**: app.trynemomemo.com landing/sign-up page, past-due banners,
   suspended screen, per-reef Settings billing section.
4. **Marketing + legal**: pricing page tier, CTAs, ToS + Privacy pages, docs page
   ("NemoMemo Cloud" in the docs sidebar).
5. **Infra**: wildcard tunnel, cloud service on the VM (separate container +
   `data/cloud/` volume, same auto-deploy pipeline), off-VM nightly backup job,
   uptime monitor.
6. **You click through everything in test mode** → flip keys to live → soft launch.

## Explicitly out of scope (v1)

Email sending (claim links shown on-screen + saved in Stripe metadata; add SMTP later),
Stripe Tax, team/seat pricing, migrations from self-host into cloud (roadmap: the
export/import feature is the bridge), SSO.
