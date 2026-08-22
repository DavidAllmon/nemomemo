# NemoMemo roadmap — brainstorm, 2026-08-22

Ideas organized by the jobs people actually hire a memo pad for. Nothing here is
committed; this is the menu we choose from. Effort: S (< half day), M (a day or two),
L (a week-ish).

## The capture job — "get it down before it swims off"

| Idea | Why | Effort |
| --- | --- | --- |
| **PWA + mobile share target** | Install NemoMemo on a phone home screen; share a link/photo from any app straight into a new memo. Biggest single capture win. | M |
| **Memo templates** | One-tap skeletons for recurring shapes: daily journal prompt, standup, meeting note, recipe. Stored per user like saved views. | M |
| **Paste-a-URL → markdown link** | Pasting a URL over selected text wraps it as `[selection](url)`; pasting bare URLs offers a title fetch. | S |
| **Keyboard shortcuts** | `c` compose, `/` search, `j/k` navigate feed, `e` edit — plus a `?` cheat-sheet dialog. (Memos still lists theirs as WIP — easy win.) | S–M |
| **Slash commands in editor** | `/task`, `/table`, `/dory` inserting structures — discoverable power. | M |

## The retrieval job — "find it again"

| Idea | Why | Effort |
| --- | --- | --- |
| **SQLite FTS5 full-text search** | Current search is a LIKE scan; FTS5 gives ranked, fast, typo-tolerant-ish search with zero new infra. Foundation for everything below. | M |
| **"On this day" / resurfacing** | Journalers' favorite feature: show memos from a year/month ago on Home. Pairs beautifully with the heatmap. | S–M |
| **Random memo ("Go fish")** | One button that surfaces a forgotten note — the daily-review ritual, NemoMemo-flavored. | S |
| **Pinned tags / favorites in sidebar** | Let users star the 3 tags they live in. | S |
| **Bulk select** | Multi-select in feed → archive/tag/delete at once. | M |

## The sharing job — small groups leaving notes for each other

| Idea | Why | Effort |
| --- | --- | --- |
| **Link preview cards** | Paste a link, get title/description/image (server-side fetch with SSRF guards). Memos shipped this in v0.29; it makes shared feeds much richer. | M |
| **Comment thread subscriptions** | Notify everyone who commented, not just the memo owner. | S |
| **RSS feeds** (`/u/:user/rss.xml`, explore feed) | Parity with memos; makes public reefs followable. | S–M |
| **Reaction notifications** | Optional inbox item when someone reacts to your memo. | S |
| **Share-as-image export** | Render a memo to a pretty PNG for messaging apps. | M |

## The forgetting job — Dory's department (our differentiator; invest here)

| Idea | Why | Effort |
| --- | --- | --- |
| **Per-memo forget window** | 1h / 24h / 3d / 7d picker on the Dory toggle (default stays 24h). Parking spots vs. weekly scratch notes. | S |
| **"Dory is about to forget…" notice** | Inbox item (or banner) 1 hour before expiry with a one-click Rescue (archive) button. Turns anxiety into trust. | M |
| **Dory's Memory page** | A view of everything currently fading, sorted by time left — the ephemeral inbox. | S–M |
| **Dory statistics** | "Dory has forgotten 214 memos for you" on the profile — makes the feature legible and fun. | S |

## The ownership job — self-hosters and tinkerers

| Idea | Why | Effort |
| --- | --- | --- |
| **Export (Markdown zip + JSON)** | Memos' most-requested gap is still WIP there — shipping real export/import first is a genuine wedge. | M |
| **Import from Memos / Google Keep** | Same wedge from the other side; Memos' API makes theirs scriptable. | M–L |
| **Personal access tokens** | `Authorization: Bearer` for scripts, Shortcuts, bots. Prereq for integrations. | M |
| **Webhooks** | memo.created/updated/deleted events (Standard Webhooks signing) → automation. | M |
| **S3/external storage** | For instances whose attachments outgrow the disk. | L |
| **i18n** | Community translations once the surface stabilizes. | L |
| **Web clipper extension** | The footer slot is already waiting. Big but high-leverage. | L |

## Suggested first wave (when we pick)

1. FTS5 search + keyboard shortcuts (retrieval + capture, both cheap, felt daily)
2. Dory forget-window picker + pre-forget rescue notice (deepen the differentiator)
3. PWA + share target (mobile capture)
4. Markdown/JSON export (trust + the memos wedge)
5. Simplification backlog items 1–4 from `AUDIT-2026-08-22.md` alongside, since they
   touch the same files.
