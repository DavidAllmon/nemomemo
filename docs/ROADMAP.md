# NemoMemo roadmap — 2026-08-23 (post-v1.13.0, committed-features edition)

The plan now that Cloud is live, the P1 milestone is fully shipped (email, snapshot
rollback, Markdown export), and the 2026-08-23 feature brainstorm has been triaged:
twelve brainstorm features are **committed** (marked ⭐ NEW below) and merged with the
existing menu into dependency-ordered implementation waves; the rest live in the
Idea locker at the bottom. Sources: the 2026-08-22 security audit (F1–F8),
`docs/AUDIT-2026-08-22.md`, and the brainstorm session.

Effort: **S** (< half day) · **M** (a day or two) · **L** (a week-ish).
Priority: **P0** do before anything else · **P1** shipped milestone (kept for the
✅ record) · **P2** the committed waves, in order · **P3** Idea locker.

Standing rule: anything that adds env vars, admin flows, or setup steps updates
`site/content/docs/` **in the same release** (deploy.mdx / admin.mdx /
getting-started.mdx).

---

## P0 — Loose ends (small, do whenever hands are free)

| Item | Why | Effort |
| --- | --- | --- |
| **Rotate the live Stripe key** | The live key transited chat during launch; roll it in the dashboard, re-run the env swap. Hygiene, not an incident. | S |
| **Stripe public business name → "NemoMemo"** | Receipts still say "Techitdave". Dashboard setting. | S |
| **bcryptjs → native bcrypt/argon2** | Move hashing off the event loop (leftover from the v1.3.0 rate-limiting fix). | S |

Everything else from the original P0 shipped: off-VM nightly backups (restic → R2,
restore drill verified) ✅ 2026-08-22 · uptime monitoring (Better Stack, 5 monitors +
2 heartbeats) ✅ 2026-08-23 · security fix PR (F1, F4–F8) ✅ v1.3.0 · rate limiting
(F3) ✅ v1.3.0.

## P1 — Email + cloud lifecycle milestone ✅ COMPLETE

Kept as the record; nothing open here.

| Item | Shipped |
| --- | --- |
| SMTP email service (`NEMOMEMO_SMTP_*`, Mailer service; Brevo creds pending on VM) | ✅ v1.8.0 |
| Password reset (audit F2; enumeration-safe, sessions revoked) | ✅ v1.9.0 |
| Claim link emails · dunning emails | ✅ v1.9.0 |
| Email verification (required-at-signup identity; verification when SMTP on) | ✅ v1.8.0 |
| Suspended-reef self-rescue ("Wake it up" → checkout on existing customer) | ✅ v1.10.0 |
| 90-day deletion job (daily registry sweep) | ✅ v1.10.0 |
| Self-serve reef export (zip) + restore-by-upload for self-host | ✅ v1.1.0 / v1.2.0 |
| Markdown export (bulk zip → per-memo "Download as .md") | ✅ v1.11.0 / v1.13.0 |
| Cloud snapshot browser + one-click rollback (file-queue handshake, restic creds stay off containers; drill verified 2026-08-23) | ✅ v1.12.0 |
| "What's New" banner · auth-page polish (password min 8, show-password, caps-lock hint) | ✅ v1.10.0 (+ v1.3.0) |
| Draft autosave | ✅ (existed; preserved through the v1.6.0 WYSIWYG rewrite) |
| Comment thread subscriptions (`MEMO_THREAD` inbox type) | ✅ v1.4.0 |

---

# P2 — The committed feature program

Six waves, ordered so each wave's infrastructure feeds the next. ⭐ NEW = committed
from the 2026-08-23 brainstorm; unmarked items were already on the menu and slot in
where their dependencies live. Inside a wave, build top-to-bottom.

## Wave 1 — The time layer (Dory's department grows up)

The dory-sweeper becomes a general minute-tick **scheduler service**, and the new
time-based features share it. This wave deepens the differentiator and is felt daily.

| Item | Why & how | Effort |
| --- | --- | --- |
| **Scheduler service** (prereq) | Generalize `services/dory-sweeper.ts` into one minute-tick service that processes `forget_at` (existing) plus new `remind_at` and `surface_at`. One migration adds both columns to `memo`. | S |
| **Per-memo forget window** | 1h / 24h / 3d / 7d picker (default 24h) in the Dory toggle. Pure UI + the existing `forget_at`. | S |
| ⭐ NEW **Reminders on any memo** | "Nudge me about this" in the ⋯ menu → date picker sets `remind_at`; scheduler fires a new `REMINDER` inbox item (+ email when SMTP is on) and clears the field. Reminder-lite without becoming a task manager; pairs with Dory: *remind me, then forget it*. | M |
| ⭐ NEW **Message in a bottle** | The inverse of Dory: `surface_at` hides a memo from all feeds until its date, then it arrives with a `BOTTLE_ARRIVED` inbox item. Guard pattern mirrors `forget_at` — every feed query gains `surface_at IS NULL OR surface_at <= now` (add to the GOTCHAS grep list). Owner sees pending bottles on a "bottles at sea" list. Rules: bottle ⟂ pinned; with Dory only if `forget_at > surface_at`. | M |
| **"Dory is about to forget…" notice** | Scheduler emits an inbox item 1h before expiry with one-click Rescue. Turns anxiety into trust. | S–M |
| **Dory's Memory page** | Everything currently fading, sorted by time left; "bottles at sea" lives on the same page. | S–M |
| **Dory statistics** | "Dory has forgotten 214 memos for you." A counter bumped by the sweeper. | S |
| **Recurring Dory reminders** | "Every Monday: water the plants" — builds on `remind_at` + a recurrence rule; do last, once one-shot reminders are proven. | M–L |

## Wave 2 — Findability (make everything in the reef searchable)

FTS5 is the foundation; then three committed features feed it so that *images, audio,
and tasks* become findable, not just typed text.

| Item | Why & how | Effort |
| --- | --- | --- |
| **SQLite FTS5 full-text search** (prereq) | Replaces the LIKE scan with ranked search, zero new infra. FTS table synced on memo write; migration backfills. Everything below indexes into it. | M |
| ⭐ NEW **Task rollup view** | One `/tasks` page aggregating every unchecked `[ ]` across your memos, checkable in place via the existing `toggleTaskAt` splice. Extend `buildPayload()` with an incomplete-task count (payload change ⇒ backfill migration rewrites payloads). Answers "what did I say I'd do?" without becoming a todo app. | M |
| ⭐ NEW **Attachment gallery view** | A media grid of every image across your memos (filterable by tag), each tile linking to its memo. Owner-scoped SQL over the attachment table — photos are heavily captured but currently only findable through their memo. | S–M |
| ⭐ NEW **OCR on image attachments** | On image upload, extract text (tesseract.js WASM keeps the Docker image slim; `NEMOMEMO_OCR=0` to opt out) into a new `attachment.extracted_text` column → FTS. Screenshots, whiteboards, and receipts become searchable. Docs: deploy.mdx env table. | M |
| **Voice memos** | Record button producing an audio attachment (playback already works). Capture while walking; prereq for transcription. | M |
| ⭐ NEW **Voice transcription** | Transcribe voice memos into `extracted_text` → FTS, transcript shown under the player. `NEMOMEMO_TRANSCRIBE_URL/KEY` pointing at any OpenAI-compatible `/audio/transcriptions` endpoint — Cloud sets it fleet-wide, self-hosters can point at a local whisper.cpp server or leave it off. Docs: deploy.mdx. | M |
| **"On this day" resurfacing** | Memos from a year/month ago on Home; journalers' favorite; pairs with the heatmap. | S–M |
| **Random memo ("Go fish")** · **Pinned tags in sidebar** · **Streaks** | Small retrieval delights; ride along whenever the feed/sidebar files are open. | S each |
| **Calendar month view** | The heatmap's big sibling: click a month, see the timeline as a calendar. | M |
| **Keyboard shortcuts** | `c` compose, `/` search, `j/k` feed, `e` edit, `?` cheat sheet — lands best once search is worth invoking. | S–M |

## Wave 3 — Trust & garden-tending (protect the year-two user)

The wave that makes 1,000 memos better than 100 — and makes people willing to keep
important things here. Trash + history + tag tools share one story: *nothing is ever
lost unless you asked Dory*.

| Item | Why & how | Effort |
| --- | --- | --- |
| **Trash (undo delete)** | Deleted memos linger 7 days (`deleted_at` + scheduler sweep) before hard delete. The safety net people expect; do first — history builds on the same mindset. | M |
| ⭐ NEW **Memo edit history** | New `memo_revision` table (memo_id FK cascade, content, created_ts); memo update writes the prior content first; prune to last 20 / 90 days via the scheduler. Diff + one-click restore in the memo ⋯ menu. Revisions readable only through `checkMemoRead` on the parent, so Dory expiry and visibility can never leak old text. Also the support story for "my memo changed". | M |
| ⭐ NEW **Tag management (rename / merge / color)** | Settings → Tags: rename rewrites the tag token in memo *content* (source of truth) and re-runs `buildPayload()` per memo in one transaction; merge = rename onto an existing tag; color stored per user, shown in chips/sidebar. Prereq ride-along: code-health #1 (dedupe the shared⇄web tag regex) so there's exactly one tokenizer to trust. Tag rot is the #1 reason memo apps get abandoned at month six. | M |
| **Bulk select** | Multi-select → archive/tag/delete at once; tag-merge UI reuses pieces of this. | M |
| **Memo templates** | One-tap skeletons (daily journal, standup, meeting note, recipe), stored per user like saved views. | M |
| **Paste-a-URL → markdown link** · **Slash commands in editor** | Editor polish batch (`/task`, `/table`, `/dory`) while the editor files are open. | S / M |

## Wave 4 — Capture & integrations (top of the funnel)

Personal access tokens unlock everything else here — build them first.

| Item | Why & how | Effort |
| --- | --- | --- |
| **Personal access tokens** (prereq) | Bearer auth for scripts, Shortcuts, bots: hashed token table with scopes (create-only vs full), Settings UI. Docs: admin.mdx. | M |
| ⭐ NEW **Telegram capture bot** | The cheapest mobile capture channel — no app store, no install. Self-host: `NEMOMEMO_TELEGRAM_BOT_TOKEN` + a long-polling service that maps a chat to a user via a one-time link code, then posts memos through the PAT path (`#tags` work inline). Cloud: one shared bot in `server/src/cloud/` mapping chat → reef+user — ship-dark, extend the isolation suite. Discord second on the same service abstraction. Docs: deploy.mdx. | M |
| **PWA + mobile share target** | Install on a phone; share a link/photo from any app into a memo. Biggest single capture win. | M |
| **Webhooks out** | memo.created/updated/deleted (Standard Webhooks signing) → automation, Zapier/n8n. | M |
| **Import from Memos / Google Keep** | The wedge from the other side, now that export is honest both directions. | M–L |
| **Email-in capture** | Mail to a private address → memo in your reef. | L |
| **Web clipper extension** | Big but high-leverage capture surface; PATs make it possible. | L |

## Wave 5 — Community & sharing (one reef recruits the next)

| Item | Why & how | Effort |
| --- | --- | --- |
| **RSS feeds** (prereq) | `/u/:user/rss.xml` + explore feed — public reefs become followable by anything. | S–M |
| ⭐ NEW **Follow a reef** | Subscribe to another reef's *public* feed inside your own home timeline. Federation-lite: the followed reef exposes a public JSON feed (sibling of RSS); the follower stores subscription rows and a scheduler job polls **over HTTP only** — never cross-DB, so cloud tenant isolation holds by construction. Items render as read-only glimpse-style cards linking out. Unidirectional, PUBLIC memos only. Every interesting public reef becomes a Cloud ad. | L |
| ⭐ NEW **Guest drop-box** | A share link where non-members drop a note *into* your reef, quarantined for approval. Owner mints a token (new `drop_token` table); the public page is **create-only** (one rate-limited POST, no reads — `checkMemoRead` stays untouched); submissions land as pending items in the owner's inbox, approve → real memo. Family suggestion box, event feedback, "text me that link" relatives — every guest touches the product. | M |
| **Link preview cards** | Server-side title/description/image fetch (SSRF-guarded); makes shared feeds richer. | M |
| **Private-memo mention hint** (main editor) | Comment box got it in v1.4.0; the main editor still reads as "mentions are broken" — hint when @mentioning in a PRIVATE memo, and when the name isn't a reef member. | S |
| **Reaction notifications** | Optional inbox item when someone reacts. | S |
| **Share-as-image export** | Render a memo to a pretty PNG for messaging apps. | M |
| **Weekly reef digest** | One optional email — what your reef-mates wrote this week. Brings quiet reefs back. | M |
| **Public memo embeds** | oEmbed/iframe for a PUBLIC memo — quotable on blogs. | M |

## Wave 6 — The cloud business (running paid reefs well)

| Item | Why & how | Effort |
| --- | --- | --- |
| **2FA (TOTP)** | At least for reefkeepers, now that email/reset exists. | M |
| **Session management** | "Signed in on 3 devices — sign out everywhere"; data model already supports it. | S–M |
| **Self-serve account deletion** | Members delete their own account (ToS/GDPR currently routes through support). | S |
| **Gift a reef** | A year of NemoMemo as a $19 gift link — memo pads are giftable in a way SaaS rarely is. | M |
| **Reef appearance** | Accent color / mascot picker per reef — cheap delight, makes a reef feel owned. | M |
| ⭐ NEW **Custom CSS for self-hosters** | A sanctioned custom-stylesheet setting (admin-only textarea, injected as a `<style>` tag) — the OKLCH variable system is already the perfect theming API. Self-host first; a Cloud reefkeeper perk later. Admin-only keeps the injection surface owned by whoever owns the instance. r/selfhosted goodwill machine. Docs: admin.mdx + a "theming your reef" page with the variable list. | S–M |
| **Custom domains** | `memos.yourname.com` → your reef. Premium-tier candidate. | L |
| **Fair-use raise flow** | "Ask for more" button instead of an email address when caps bind. | S |

---

## P3 — Idea locker (brainstormed 2026-08-23, not scheduled)

Kept warm, not committed. Promote by moving into a wave.

- **Backlinks / wiki-links** — `[[memo]]` links + a linked-from panel; the personal-knowledge-base turn. (Natural Wave 2/3 follow-on: one more `buildPayload()` walk.)
- **Tide pools (collections)** — named, ordered, shareable memo sets (trip plans, recipe boxes); close to the existing relation model.
- **Locked memos** — extra passphrase/WebAuthn tap to reveal specific memos even while signed in.
- **Weekly review mode** — guided pass over last week's memos: tag, archive, rescue, or let Dory have it.
- **Mood/rating stamp** — one-tap emoji per memo, charted next to the heatmap.
- **Daily prompt** — rotating reef-voiced prompt as compose-box placeholder text.
- **"Year in the Reef" recap** — shareable annual stats card; marketing flywheel.
- **Duplicate detection** — "this looks like a memo from March" hint at compose time.
- **Kiosk / fridge mode** — read-only big-type auto-refreshing display view for a family reef.
- **Split & merge memos** — split-at-cursor / merge-selected, respecting markdown-source-is-truth.
- **Print / PDF stylesheet** — `@media print` pass; recipes and checklists live partly on paper.
- **S3/external storage** — for instances whose attachments outgrow the disk. (L)
- **i18n** — community translations once the surface stabilizes. (L)

## Code health (from `docs/AUDIT-2026-08-22.md` — still open)

1. **S** Dedupe tag/mention regexes (shared ⇄ web) — **now a prereq for Wave 3 tag management**.
2. **M** Move `/-/tags` + `/:u/stats` aggregation into SQL `json_each` (removes the 10k cap) — do before any reef grows large; Wave 2's payload work is the natural moment.
3. **S** Extract `assertOwner` into `services/acl.ts`.
4. **M** Route-level code splitting (1.4MB chunk → lazy routes; editor/highlighter chunks) — do before Wave 2 adds gallery/tasks/calendar routes.
5. **S** Remove server's unused remark/unified deps.
6. **S** Delete dead `toggleTask`.
7. **S** Logo SVG canonical-copy note.
8. ~~**S** `avatarUrl` validation + size cap (audit F6).~~ ✅ v1.3.0
9. **M** Post-deploy smoke test in `update.sh` (curl healthz + one API call; auto-rollback is L, alert first). *Partial 2026-08-22: update.sh now retries failed deploys (deployed.rev), logs FAILED lines, and GCs build cache after the disk-full wedge — smoke test + alerting still open.*
10. **M** Error tracking (self-hosted-friendly Sentry or log-based) — right now production errors vanish into `docker logs`.

## Business & legal

| Item | Why | Effort |
| --- | --- | --- |
| **Trademark "NemoMemo"** | The license now blocks resale; the trademark blocks the *name*. ~$300 USPTO when revenue justifies. | S (money) |
| **Stripe Tax** | Off at launch per plan; revisit when US state thresholds get close. | S |
| **VPS migration path** | The homelab → $5 VPS rsync+tunnel move, documented and rehearsed, for when uptime expectations grow. | M |
| **Staging lane** | A `staging` branch + container on the VM so risky changes soak before hitting paying reefs. | M |

## Suggested order

1. **P0 loose ends** — three small items, clear the deck.
2. **Wave 1 (time layer)** — scheduler + reminders + message in a bottle + Dory polish. One migration, one service, several features that deepen the differentiator; felt daily.
3. **Wave 2 (findability)** — FTS5 first, then task rollup + gallery, then OCR; voice memos + transcription as their own release. Code-health #2 and #4 ride along.
4. **Wave 3 (trust)** — trash → edit history → tag management (regex dedupe first). This is the wave that keeps year-two subscribers.
5. **Wave 4 (capture)** — PATs → Telegram bot → PWA/share target; webhooks and import as follow-ons.
6. **Wave 5 (community)** — RSS → guest drop-box → follow-a-reef (the L item lands last, on proven feed infra).
7. **Wave 6 (cloud)** — 2FA + sessions + account deletion as one auth batch; custom CSS whenever a delight release is wanted — it's independent of everything else.

Waves are releases, roughly: each item ships on its own (`pnpm release` per push), but
the ordering inside a wave is dependency-real, not aesthetic.
