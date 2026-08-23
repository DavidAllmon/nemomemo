# NemoMemo roadmap — 2026-08-22 (post-launch edition)

The complete picture now that NemoMemo Cloud is **live and taking real money**: security
findings, operations debt, the feature menu, and code health — in priority order.
Sources: the 2026-08-22 security audit (findings F1–F8, report artifact kept by David),
`docs/AUDIT-2026-08-22.md` (code audit + simplification backlog), and the launch itself.

Effort: **S** (< half day) · **M** (a day or two) · **L** (a week-ish).
Priority: **P0** do before anything else · **P1** next milestone · **P2** feature waves ·
**P3** someday/speculative.

---

## P0 — Now (paying customers exist; these are the fires-in-waiting)

| Item | Why | Effort |
| --- | --- | --- |
| ~~**Off-VM nightly backups**~~ ✅ DONE 2026-08-22 | restic → Cloudflare R2 (`nemomemo-cloud-backups`, free tier), consistent SQLite snapshots nightly at 07:17 UTC, 14 daily + 8 weekly retention, restore drill verified. | — |
| ~~**Uptime monitoring**~~ ✅ DONE 2026-08-23 | Better Stack (free): 5 monitors (app/demo/site/reef-canary/self-updating version canary) + 2 heartbeats (backup, demo reset), wired via API; update.sh syncs the version keyword each deploy. | — |
| ~~**Security fix PR** (audit F1, F4, F5, F6, F7, F8)~~ ✅ DONE 2026-08-22 (v1.3.0) | Attachment nosniff + sandbox/attachment disposition, `Secure` cookie flag, security-header middleware, sign-in dummy-hash, avatarUrl scheme/size cap, password min 8. | — |
| ~~**Rate limiting** (audit F3)~~ ✅ v1.3.0 (limiter) | Per-IP fixed-window limiter honoring `CF-Connecting-IP` on signin/signup/checkout. **Still open (S):** swap bcryptjs → native bcrypt/argon2 off the event loop. | S |
| **Rotate the live Stripe key** | The live key transited chat during launch; roll it in the dashboard, re-run the env swap. Hygiene, not an incident. | S |
| **Stripe public business name → "NemoMemo"** | Receipts still say "Techitdave". Dashboard setting. | S |

## P1 — Next milestone: email (one feature unlocks five) + cloud lifecycle

| Item | Why | Effort |
| --- | --- | --- |
| ~~**SMTP email service**~~ ✅ v1.8.0 (`NEMOMEMO_SMTP_*` env, Mailer service; Brevo creds pending on VM) | The keystone: env-configured (self-host optional), one small service. Everything below depends on it. | — |
| ~~→ **Password reset** (audit F2)~~ ✅ v1.9.0 (forgot/reset, enumeration-safe, sessions revoked) | The #1 support fire — closed. | — |
| ~~→ **Claim link emails**~~ ✅ v1.9.0 (emailed at provisioning; receipts = enable Stripe's own in dashboard) | Claim links were on-screen only. | — |
| ~~→ **Dunning emails**~~ ✅ v1.9.0 (invoice.payment_failed → buyer email) | Saves real revenue. | — |
| ~~→ **Email verification**~~ ✅ v1.8.0 (required-at-signup identity per spec; verification when SMTP on) | Anchor accounts for recovery. | — |
| ~~**Suspended-reef self-rescue**~~ ✅ v1.10.0 ("Wake it up" → checkout on the existing customer; webhook revives the same reef) | The nap page dead-ended. | — |
| ~~**90-day deletion job**~~ ✅ v1.10.0 (daily registry sweep; registry migration 0002 status_changed_ts) | ToS promise, now automatic. | — |
| ~~**Self-serve reef export**~~ ✅ v1.1.0 (zip) + restore-by-upload for self-host in v1.2.0; Markdown-format export still open | Settings → Backups. | M |
| **Cloud snapshot browser + one-click rollback** | David's vision: the Backups tab lists every nightly snapshot; pick a date, restore the reef to it. Needs a host-side backup agent the app can query (restic creds stay off the containers) + per-reef restore via fleet evict/replace. Support-manual rollback in the meantime. | L |
| ~~**"What's New" banner**~~ ✅ v1.10.0 (lastSeenVersion in localStorage → dismissible banner → /changelog) | Version-change visibility. | — |
| ~~**Password minimum → 8** (audit F8) + show-password toggle + caps-lock hint~~ ✅ v1.3.0 + v1.10.0 | Auth-page polish batch. | — |

## P2 — Feature waves, by the job people hire a memo pad for

### The capture job — "get it down before it swims off"

| Idea | Why | Effort |
| --- | --- | --- |
| **PWA + mobile share target** | Install on a phone; share a link/photo from any app into a memo. Biggest single capture win. | M |
| **Memo templates** | One-tap skeletons: daily journal, standup, meeting note, recipe. Stored per user like saved views. | M |
| **Keyboard shortcuts** | `c` compose, `/` search, `j/k` feed, `e` edit, `?` cheat sheet. | S–M |
| **Paste-a-URL → markdown link** | Paste over selection wraps `[selection](url)`; bare URLs offer a title fetch. | S |
| **Slash commands in editor** | `/task`, `/table`, `/dory` — discoverable power. | M |
| **NEW: Voice memos** | A record button producing an audio attachment (playback already works). Capture while walking. | M |
| ~~**NEW: Draft autosave**~~ ✅ (existed; preserved through the v1.6.0 WYSIWYG rewrite) | Unsent drafts survive closed tabs. | — |
| **NEW: Email-in capture** | Post-SMTP, later: mail to a private address → memo in your reef. | L |

### The retrieval job — "find it again"

| Idea | Why | Effort |
| --- | --- | --- |
| **SQLite FTS5 full-text search** | Replaces the LIKE scan with ranked fast search, zero new infra. Foundation for everything here. | M |
| **"On this day" resurfacing** | Memos from a year/month ago on Home; journalers' favorite; pairs with the heatmap. | S–M |
| **Random memo ("Go fish")** | Surface one forgotten note — the daily-review ritual, reef-flavored. | S |
| **Pinned tags / favorites in sidebar** | Star the 3 tags you live in. | S |
| **Bulk select** | Multi-select → archive/tag/delete at once. | M |
| **NEW: Calendar month view** | The heatmap's big sibling: click a month, see the timeline as a calendar. | M |
| **NEW: Streaks** | "12 days writing" on the profile next to the heatmap — cheap, sticky. | S |
| **NEW: Trash (undo delete)** | Deleted memos linger 7 days before hard delete. Safety net people expect. | M |

### The sharing job — small groups leaving notes for each other

| Idea | Why | Effort |
| --- | --- | --- |
| **Link preview cards** | Server-side title/description/image fetch (SSRF-guarded); makes shared feeds richer. | M |
| ~~**Comment thread subscriptions**~~ ✅ v1.4.0 (`MEMO_THREAD` inbox type) | Notify everyone who commented, not just the owner. | — |
| **RSS feeds** | `/u/:user/rss.xml` + explore feed — public reefs become followable. | S–M |
| **Reaction notifications** | Optional inbox item when someone reacts. | S |
| **NEW: Private-memo mention hint** — ✅ comment box in v1.4.0; main memo editor still open | Field report 2026-08-22: mentions in PRIVATE memos never notify (by design — a ping would leak the memo's existence), but the editor doesn't say so, which reads as "mentions are broken". Show a small hint when @mentioning in a private memo; also hint when the mentioned name isn't a member of this reef. | S |
| **Share-as-image export** | Render a memo to a pretty PNG for messaging apps. | M |
| **NEW: Weekly reef digest** | Post-SMTP: one optional email — what your reef-mates wrote this week. Brings quiet reefs back. | M |
| **NEW: Public memo embeds** | oEmbed/iframe for a PUBLIC memo — quotable on blogs. | M |

### The forgetting job — Dory's department (the differentiator; invest here)

| Idea | Why | Effort |
| --- | --- | --- |
| **Per-memo forget window** | 1h / 24h / 3d / 7d picker (default 24h). Parking spots vs. weekly scratch notes. | S |
| **"Dory is about to forget…" notice** | Inbox/banner 1h before expiry with one-click Rescue. Turns anxiety into trust. | M |
| **Dory's Memory page** | Everything currently fading, sorted by time left — the ephemeral inbox. | S–M |
| **Dory statistics** | "Dory has forgotten 214 memos for you." Makes the feature legible and fun. | S |
| **NEW: Recurring Dory reminders** | "Every Monday: water the plants" — a memo that re-appears and re-forgets. Reminder-lite without becoming a task manager. | M–L |

### The ownership job — self-hosters and tinkerers

| Idea | Why | Effort |
| --- | --- | --- |
| **Export (Markdown zip + JSON)** | Shared with P1's self-serve export — the trust feature and the Memos wedge. | M |
| **Import from Memos / Google Keep** | The wedge from the other side. | M–L |
| **Personal access tokens** | Bearer auth for scripts, Shortcuts, bots. Prereq for integrations. | M |
| **Webhooks out** | memo.created/updated/deleted (Standard Webhooks signing) → automation, Zapier/n8n. | M |
| **S3/external storage** | For instances whose attachments outgrow the disk. | L |
| **Web clipper extension** | Big but high-leverage capture surface. | L |
| **i18n** | Community translations once the surface stabilizes. | L |

### NEW: The cloud job — running a paid reef well

| Idea | Why | Effort |
| --- | --- | --- |
| **Gift a reef** | A year of NemoMemo as a $19 gift link — memo pads are giftable in a way SaaS rarely is. | M |
| **2FA (TOTP)** | At least for reefkeepers, once email/reset exists. | M |
| **Session management** | "Signed in on 3 devices — sign out everywhere" in Settings; data model already supports it. | S–M |
| **Self-serve account deletion** | Members can delete their own account (ToS/GDPR story currently routes through support). | S |
| **Custom domains** | `memos.yourname.com` → your reef. Premium-tier candidate. | L |
| **Reef appearance** | Accent color / mascot picker per reef — cheap delight, makes a reef feel owned. | M |
| **Fair-use raise flow** | "Ask for more" button instead of an email address when caps bind. | S |

## Code health (from `docs/AUDIT-2026-08-22.md` — still open)

1. **S** Dedupe tag/mention regexes (shared ⇄ web).
2. **M** Move `/-/tags` + `/:u/stats` aggregation into SQL `json_each` (removes the 10k cap) — do before any reef grows large.
3. **S** Extract `assertOwner` into `services/acl.ts`.
4. **M** Route-level code splitting (1.4MB chunk → lazy routes; editor/highlighter chunks).
5. **S** Remove server's unused remark/unified deps.
6. **S** Delete dead `toggleTask`.
7. **S** Logo SVG canonical-copy note.
8. ~~**NEW S** `avatarUrl` validation + size cap (audit F6).~~ ✅ v1.3.0
9. **NEW M** Post-deploy smoke test in `update.sh` (curl healthz + one API call; auto-rollback is L, alert first). *Partial 2026-08-22: update.sh now retries failed deploys (deployed.rev), logs FAILED lines, and GCs build cache after the disk-full wedge — smoke test + alerting still open.*
10. **NEW M** Error tracking (self-hosted-friendly Sentry or log-based) — right now production errors vanish into `docker logs`.

## Business & legal

| Item | Why | Effort |
| --- | --- | --- |
| **Trademark "NemoMemo"** | The license now blocks resale; the trademark blocks the *name*. ~$300 USPTO when revenue justifies. | S (money) |
| **Stripe Tax** | Off at launch per plan; revisit when US state thresholds get close. | S |
| **VPS migration path** | The homelab → $5 VPS rsync+tunnel move, documented and rehearsed, for when uptime expectations grow. | M |
| **Staging lane** | A `staging` branch + container on the VM so risky changes soak before hitting paying reefs. | M |

## Suggested order

1. **P0, all of it** — backups first, same week the security PR lands.
2. **Email milestone** (P1) — reset + claim + dunning; then suspended-self-rescue + 90-day job + export.
3. **First feature wave**: FTS5 + keyboard shortcuts + Dory forget-window + pre-forget notice + What's-New banner (cheap, felt daily, deepens the differentiator).
4. **Second wave**: PWA/share target + export/import + access tokens (capture + the Memos wedge).
5. Code-health items 1–4 ride along whenever their files are already open.
