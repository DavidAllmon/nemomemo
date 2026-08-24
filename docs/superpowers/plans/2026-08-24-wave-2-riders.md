# Wave 2 riders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Wave 2's ride-along items from `docs/ROADMAP.md` — calendar month
view, "On this day" resurfacing, streaks, keyboard shortcuts, Go fish (random memo),
and pinned tags — shipped as two releases.

**Architecture:** Two of the four riders are pure retrieval UI over data the app
already serves (`GET /users/:username/stats` gives every `created_ts`; the memo list
route accepts arbitrary filter expressions), so **the timezone stays on the client**
— exactly like `chipsToExpression`'s `displayTime` chip, which resolves a local day
to an epoch range in the browser. That keeps historical DST correct (a memo from six
months ago gets that date's real offset) and adds no new memo-exposing surface: every
query still travels through `listMemoRows` → `buildMemoListWhere`, so the Dory guard,
the bottle guard and the comment exclusion are inherited by construction. Only two
riders need the server: Go fish (a random pick must happen in SQL) and pinned tags (a
user setting). Those get server tests first.

**Tech Stack:** React 19 + TanStack Query v5 + Tailwind v4 (web), Hono + Drizzle +
better-sqlite3 (server), vitest everywhere.

**Spec:** `docs/ROADMAP.md` § "Wave 2 — Findability" (the four unshipped rows:
"On this day" resurfacing · Random memo / Pinned tags / Streaks · Calendar month
view · Keyboard shortcuts).

## Global Constraints

- **Release discipline.** Any push touching `shared/`, `server/`, `web/`, or
  `Dockerfile` goes through `pnpm release [patch|minor|major]` (two-run flow) with a
  `docs/changelog/vX.Y.Z.md` carrying BOTH sections, then `git push --follow-tags`.
  This plan ships **two** releases: **v1.22.0** (Tasks 1–4) and **v1.23.0**
  (Tasks 5–8).
- **Green before every push:** `pnpm typecheck && pnpm test && pnpm build`.
  Push to main is production for a paying customer in ~4–8 minutes.
- **Every memo-returning query builds its WHERE via `buildMemoListWhere`** (Dory
  guard + bottle guard + comment exclusion + scope). Never hand-write a memo WHERE.
- **No new stores.** Server state = TanStack Query; filter state = URL; three
  contexts only.
- **Theming:** colors come from the OKLCH semantic tokens (`bg-ocean`, `text-dory`,
  `bg-accent`, `text-muted-foreground`, …) in `web/src/index.css`. No hex literals.
  Any animation sits behind a `prefers-reduced-motion` guard.
- **Voice:** reef voice, clarity first. Empty/error copy says what happened and what
  to do next, then the fish.
- **Route ordering:** new static memo routes (`/random`) MUST be registered before
  `/:uid` in `server/src/routes/memos.ts`.
- Public-docs rule: no env vars or admin flows here, so `deploy.mdx`/`admin.mdx` are
  untouched; the user-facing keyboard shortcuts get a section in
  `site/content/docs/memos.mdx` in the same release (Task 8).

---

## File Structure

**Release v1.22.0 — "Time travel"**

| File | Responsibility |
| --- | --- |
| `web/src/lib/time-travel.ts` (create) | Pure, timezone-aware date math: `localDayKey`, `monthRange`, `anniversaryAnchors`, `anchorsToFilter`, `streakFrom`. No React, no fetch. |
| `web/src/lib/time-travel.test.ts` (create) | vitest suite for the above (web vitest already globs `src/**/*.test.ts`). |
| `web/src/components/home/OnThisDay.tsx` (create) | Home card: queries the anchor ranges in one memo-list call, groups by anchor, collapsible. |
| `web/src/pages/Calendar.tsx` (create) | `/calendar` month grid with real memo content in cells + selected-day list. |
| `web/src/pages/Home.tsx` (modify) | Mount `<OnThisDay />` above the feed. |
| `web/src/App.tsx` (modify) | Lazy `/calendar` route behind `RequireAuth`. |
| `web/src/components/layout/Sidebar.tsx` (modify) | "Calendar" nav item + streak line. |
| `web/src/components/layout/CalendarHeatmap.tsx` (modify) | Month label becomes a link to `/calendar?month=YYYY-MM`; streak line underneath. |

**Release v1.23.0 — "Quick hands"**

| File | Responsibility |
| --- | --- |
| `shared/src/schemas/index.ts` (modify) | `pinnedTags` on `userGeneralSettingSchema`. |
| `server/src/routes/memos.ts` (modify) | `GET /memos/random` (static path, before `/:uid`). |
| `server/src/test/memos.test.ts` (modify) | Random-memo guard tests. |
| `server/src/test/memos.test.ts` / `auth.test.ts` (modify) | Pinned-tags settings round trip. |
| `web/src/hooks/queries.ts` (modify) | `useRandomMemo` mutation hook. |
| `web/src/hooks/use-shortcuts.ts` (create) | The one global keydown listener + its guard rules. |
| `web/src/components/ShortcutsDialog.tsx` (create) | `?` cheat sheet. |
| `web/src/components/layout/AppShell.tsx` (modify) | Mount shortcuts + cheat sheet; keep ⌘K. |
| `web/src/components/memo/MemoCard.tsx` (modify) | `data-memo-card` + `tabIndex={-1}` so `j/k/e/Enter` can address cards. |
| `web/src/components/editor/MemoEditor.tsx` (modify) | Listen for `nemo:compose` → focus the editor. |
| `web/src/components/layout/TagTree.tsx` (modify) | Pinned section + pin/unpin control. |
| `web/src/components/layout/Sidebar.tsx` (modify) | "Go fish" button. |
| `site/content/docs/memos.mdx` (modify) | Keyboard shortcuts section. |

---

# RELEASE v1.22.0 — Time travel

### Task 1: Timezone-aware date math (`web/src/lib/time-travel.ts`)

Everything the calendar, "On this day" and streaks need, as pure functions, so the
fiddly parts (month-end clamping, DST, streak boundaries) are unit-tested once.

**Files:**
- Create: `web/src/lib/time-travel.ts`
- Test: `web/src/lib/time-travel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `localDayKey(date: Date): string` — `YYYY-MM-DD` in the browser's zone (same
    algorithm as `CalendarHeatmap.dayKey`, which will now import this).
  - `dayRange(key: string): { start: number; end: number }` — epoch seconds
    `[startOfDay, startOfNextDay)`, local.
  - `monthRange(year: number, monthIndex: number): { start: number; end: number }`.
  - `type Anchor = { key: string; label: string; start: number; end: number }`
  - `anniversaryAnchors(now: Date): Anchor[]` — the days worth resurfacing: 1, 3 and
    6 months ago, then 1..10 years ago. Month-end clamped (May 31 − 3 months → Feb 28
    or 29, never Mar 2/3).
  - `anchorsToFilter(anchors: Anchor[]): string` — one filter expression:
    `(created_ts >= a && created_ts < b) || (…)`.
  - `streakFrom(timestamps: number[], now: Date): { current: number; longest: number }`
    — consecutive local days with at least one memo; `current` counts back from today,
    and from yesterday when today is still empty (so the streak doesn't read as broken
    before you've written).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/time-travel.test.ts
import { describe, expect, it } from 'vitest';
import {
  anchorsToFilter,
  anniversaryAnchors,
  dayRange,
  localDayKey,
  monthRange,
  streakFrom,
} from './time-travel.js';

const at = (iso: string) => new Date(iso); // local-time literals, no Z

describe('localDayKey', () => {
  it('formats the local calendar day', () => {
    expect(localDayKey(at('2026-08-24T13:45:00'))).toBe('2026-08-24');
  });
  it('pads single digits', () => {
    expect(localDayKey(at('2026-01-05T00:00:00'))).toBe('2026-01-05');
  });
});

describe('dayRange', () => {
  it('spans exactly one local day', () => {
    const { start, end } = dayRange('2026-08-24');
    expect(end - start).toBe(24 * 3600);
    expect(localDayKey(new Date(start * 1000))).toBe('2026-08-24');
    expect(localDayKey(new Date((end - 1) * 1000))).toBe('2026-08-24');
  });
});

describe('monthRange', () => {
  it('covers the first instant of the month to the first of the next', () => {
    const { start, end } = monthRange(2026, 1); // February 2026
    expect(localDayKey(new Date(start * 1000))).toBe('2026-02-01');
    expect(localDayKey(new Date(end * 1000))).toBe('2026-03-01');
  });
});

describe('anniversaryAnchors', () => {
  it('offers months first, then years, newest first', () => {
    const anchors = anniversaryAnchors(at('2026-08-24T09:00:00'));
    expect(anchors.map((a) => a.key).slice(0, 4)).toEqual([
      '2026-07-24',
      '2026-05-24',
      '2026-02-24',
      '2025-08-24',
    ]);
    expect(anchors[0]!.label).toBe('A month ago');
    expect(anchors[1]!.label).toBe('3 months ago');
    expect(anchors[3]!.label).toBe('A year ago');
    expect(anchors.at(-1)!.label).toBe('10 years ago');
  });

  it('clamps to the end of a shorter month instead of spilling forward', () => {
    const anchors = anniversaryAnchors(at('2026-05-31T09:00:00'));
    expect(anchors[0]!.key).toBe('2026-04-30');
    expect(anchors[2]!.key).toBe('2025-11-30');
  });

  it('clamps a leap day to Feb 28 in common years', () => {
    const anchors = anniversaryAnchors(at('2028-02-29T09:00:00'));
    expect(anchors.find((a) => a.label === 'A year ago')!.key).toBe('2027-02-28');
  });

  it('gives every anchor a one-day range', () => {
    for (const anchor of anniversaryAnchors(at('2026-08-24T09:00:00'))) {
      expect(anchor.end - anchor.start).toBe(24 * 3600);
    }
  });
});

describe('anchorsToFilter', () => {
  it('ORs parenthesised half-open ranges', () => {
    const filter = anchorsToFilter([
      { key: 'a', label: 'A', start: 10, end: 20 },
      { key: 'b', label: 'B', start: 30, end: 40 },
    ]);
    expect(filter).toBe(
      '(created_ts >= 10 && created_ts < 20) || (created_ts >= 30 && created_ts < 40)',
    );
  });
});

describe('streakFrom', () => {
  const day = (key: string) => dayRange(key).start + 3600;

  it('counts consecutive days ending today', () => {
    const stamps = ['2026-08-24', '2026-08-23', '2026-08-22'].map(day);
    expect(streakFrom(stamps, at('2026-08-24T20:00:00'))).toEqual({ current: 3, longest: 3 });
  });

  it('keeps yesterday-anchored streaks alive before today is written', () => {
    const stamps = ['2026-08-23', '2026-08-22'].map(day);
    expect(streakFrom(stamps, at('2026-08-24T09:00:00')).current).toBe(2);
  });

  it('breaks after a gap of two days', () => {
    const stamps = ['2026-08-21', '2026-08-20'].map(day);
    expect(streakFrom(stamps, at('2026-08-24T09:00:00')).current).toBe(0);
  });

  it('ignores duplicates within a day', () => {
    const stamps = [day('2026-08-24'), day('2026-08-24') + 60, day('2026-08-23')];
    expect(streakFrom(stamps, at('2026-08-24T09:00:00')).current).toBe(2);
  });

  it('reports the longest run anywhere in history', () => {
    const stamps = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-08-24'].map(day);
    expect(streakFrom(stamps, at('2026-08-24T09:00:00'))).toEqual({ current: 1, longest: 4 });
  });

  it('is empty for an empty reef', () => {
    expect(streakFrom([], at('2026-08-24T09:00:00'))).toEqual({ current: 0, longest: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nemomemo/web exec vitest run src/lib/time-travel.test.ts`
Expected: FAIL — cannot resolve `./time-travel.js`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/lib/time-travel.ts
/**
 * Local-calendar date math for the retrieval features (calendar, "On this day",
 * streaks). The browser's zone is the source of truth here — same reasoning as
 * `chipsToExpression`'s displayTime chip: resolving a calendar day to an epoch
 * range in the browser gets each historical date its own real UTC offset, which a
 * server-side fixed offset would get wrong across DST boundaries.
 */

export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const epoch = (date: Date): number => Math.floor(date.getTime() / 1000);

export function dayRange(key: string): { start: number; end: number } {
  const [y, m, d] = key.split('-').map(Number);
  return {
    start: epoch(new Date(y!, m! - 1, d!)),
    end: epoch(new Date(y!, m! - 1, d! + 1)),
  };
}

export function monthRange(year: number, monthIndex: number): { start: number; end: number } {
  return {
    start: epoch(new Date(year, monthIndex, 1)),
    end: epoch(new Date(year, monthIndex + 1, 1)),
  };
}

export interface Anchor {
  key: string;
  label: string;
  start: number;
  end: number;
}

/** Same day-of-month N months back, clamped to that month's last day. */
function shiftMonths(from: Date, months: number): Date {
  const target = new Date(from.getFullYear(), from.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(from.getDate(), lastDay));
}

const MONTHS_BACK: [number, string][] = [
  [1, 'A month ago'],
  [3, '3 months ago'],
  [6, '6 months ago'],
];

/** The days worth resurfacing on Home, newest first. */
export function anniversaryAnchors(now: Date): Anchor[] {
  const anchors: Anchor[] = [];
  const push = (date: Date, label: string) => {
    const key = localDayKey(date);
    anchors.push({ key, label, ...dayRange(key) });
  };
  for (const [months, label] of MONTHS_BACK) push(shiftMonths(now, months), label);
  for (let years = 1; years <= 10; years += 1) {
    push(shiftMonths(now, years * 12), years === 1 ? 'A year ago' : `${years} years ago`);
  }
  return anchors;
}

/** One filter expression matching any of the anchor days. */
export function anchorsToFilter(anchors: Anchor[]): string {
  return anchors
    .map((anchor) => `(created_ts >= ${anchor.start} && created_ts < ${anchor.end})`)
    .join(' || ');
}

/**
 * Consecutive local days with at least one memo. `current` counts back from
 * today, or from yesterday when today is still blank — a streak shouldn't read
 * as broken just because you haven't written yet this morning.
 */
export function streakFrom(
  timestamps: number[],
  now: Date,
): { current: number; longest: number } {
  const days = new Set(timestamps.map((ts) => localDayKey(new Date(ts * 1000))));
  if (days.size === 0) return { current: 0, longest: 0 };

  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = dayRange(sorted[i - 1]!).start;
    const current = dayRange(sorted[i]!).start;
    // Day length varies across DST; anything under 36h apart is "the next day".
    run = current - previous <= 36 * 3600 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (days.has(localDayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nemomemo/web exec vitest run src/lib/time-travel.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Point the heatmap at the shared helper**

In `web/src/components/layout/CalendarHeatmap.tsx`, delete the local `dayKey`
function and `import { localDayKey } from '@/lib/time-travel.js'`, replacing the
three `dayKey(` call sites. Behavior is identical — this just removes the duplicate.

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/time-travel.ts web/src/lib/time-travel.test.ts \
  web/src/components/layout/CalendarHeatmap.tsx
git commit -m "feat(web): local-calendar date math for the time-travel riders"
```

---

### Task 2: "On this day" on Home

**Files:**
- Create: `web/src/components/home/OnThisDay.tsx`
- Modify: `web/src/pages/Home.tsx`

**Interfaces:**
- Consumes: `anniversaryAnchors`, `anchorsToFilter` (Task 1); `useMemoList` from
  `@/hooks/queries.js` (`MemoListParams` = `{ scope, filter, limit?, … }` — check the
  exact type at `web/src/hooks/queries.ts:140-170` before writing); `MemoCard` from
  `@/components/memo/MemoCard.js`.
- Produces: `<OnThisDay />` (no props).

- [ ] **Step 1: Build the component**

Behavior contract:
- Computes anchors once per mount (`useMemo(() => anniversaryAnchors(new Date()), [])`).
- One query: `useMemoList({ scope: 'home', filter: anchorsToFilter(anchors) })`.
  Guards, comment exclusion and creator scoping all come from the server's
  `buildMemoListWhere` — nothing to re-check here.
- Renders nothing at all when loading, on error, or when zero memos come back. This
  card must never appear as an empty shell.
- Groups the returned memos by anchor: for each anchor, `memos.filter(m =>
  m.createdTs >= anchor.start && m.createdTs < anchor.end)`; drop empty anchors.
- Shows at most `3` memos per anchor and at most `2` non-empty anchors (newest
  first) — Home stays a writing surface, not a scrapbook. When an anchor has more,
  a footer link `See all N from <label>` navigates to `/?filter=displayTime:<key>`.
- Header: shell icon + `On this day` + a chevron toggle. Collapsed state persists in
  `localStorage` under `nemo-on-this-day` (wrap every read/write in try/catch — the
  codebase's existing pattern, see `AppShell.tsx`'s banners).
- Container styling matches Home's editor card: `rounded-2xl border border-border
  bg-card p-4 mb-4`. The anchor label is `text-xs font-bold text-muted-foreground`.

- [ ] **Step 2: Mount it on Home**

In `web/src/pages/Home.tsx`, render `<OnThisDay />` directly after the editor card
and before the `Your reef` heading row. It is self-hiding, so no conditional needed.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm --filter @nemomemo/web exec vitest run`
Expected: clean, PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/home/OnThisDay.tsx web/src/pages/Home.tsx
git commit -m "feat(web): On this day — Home resurfaces what you wrote a month, six months, a year back"
```

---

### Task 3: Calendar month view (`/calendar`)

The heatmap's big sibling: a real month grid with memo content in the cells.

**Files:**
- Create: `web/src/pages/Calendar.tsx`
- Modify: `web/src/App.tsx`, `web/src/components/layout/Sidebar.tsx`,
  `web/src/components/layout/CalendarHeatmap.tsx`

**Interfaces:**
- Consumes: `localDayKey`, `monthRange`, `dayRange` (Task 1); `useMemoList`;
  `useViewer`; `MemoCard`.
- Produces: `CalendarPage` (named export, lazy-imported by `App.tsx`).

- [ ] **Step 1: Build the page**

Behavior contract:
- URL is the state: `?month=YYYY-MM` (defaults to the current month) and
  `?day=YYYY-MM-DD` for the selection. Read/write with `useSearchParams` so
  back/forward work and the month is linkable — consistent with filter state living
  in the URL.
- One query per month: `useMemoList({ scope: 'home', filter: `created_ts >=
  ${start} && created_ts < ${end}`, limit: 200 })` where `{start, end} =
  monthRange(...)`. `MAX_PAGE_SIZE` is 200; when `hasMore`/`nextPageToken` is
  present, show a quiet footer note `Showing the first 200 memos this month.` rather
  than paginating a calendar.
- Cells: 7-column grid, `min-h-24`, day number top-left; up to 3 memo lines per day
  (`snippet` = first non-empty line of `memo.content`, truncated with
  `line-clamp-1`), then `+N more`. Empty cells stay empty (no zero counts).
- Leading/trailing cells from the neighbouring months render dimmed
  (`text-muted-foreground/40`) and are not clickable.
- Today's cell gets `ring-1 ring-primary`; the selected day gets `ring-2
  ring-inset ring-primary` + `bg-ocean/10`.
- Clicking a day sets `?day=` and reveals a list of that day's memos **below the
  grid**, rendered with `MemoCard` (full memo, actions and all) so the calendar is a
  place you can actually work, not just look.
- Header row: `‹` / `›` month steppers (reuse `ChevronLeft`/`ChevronRight` from
  lucide-react), the month label as an `h1`, a `Today` button, and the month's memo
  count (`N memos`). Steppers must be real buttons with `aria-label="Previous
  month"` / `"Next month"`.
- Mobile: the grid is horizontally cramped at 7 columns — keep cells `min-h-16` and
  drop the memo lines below `sm:` (`hidden sm:block`), leaving the day number and a
  count dot. The day list below the grid is the mobile experience.
- Empty month: `EmptyState` from `@/components/EmptyState.js` with
  `title="Nothing this month"` / `hint="Quiet water. Pick another month, or write
  something today. 🫧"`.

- [ ] **Step 2: Wire the route**

In `web/src/App.tsx`:

```tsx
const CalendarPage = lazy(() => import('@/pages/Calendar.js').then((m) => ({ default: m.CalendarPage })));
```

and, inside the `AppShell` route block next to `/tasks`:

```tsx
<Route
  path="/calendar"
  element={
    <RequireAuth>
      <CalendarPage />
    </RequireAuth>
  }
/>
```

- [ ] **Step 3: Wire the entry points**

- `Sidebar.tsx`: add `<NavItem to="/calendar" icon={<CalendarDays className="size-4" />} label="Calendar" />` to the
  authenticated nav block, after `Archived` (import `CalendarDays` from lucide-react).
- `CalendarHeatmap.tsx`: turn the month label into a `<Link to={\`/calendar?month=${yyyy}-${mm}\`}>`
  with `hover:text-foreground` and `title="Open the month view"`, where `yyyy-mm`
  comes from the currently displayed `monthStart`. The heatmap keeps its own
  prev/next behavior — the link just opens the big sibling on the month you're
  looking at.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean; `Calendar-*.js` appears as its own chunk in the Vite output.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Calendar.tsx web/src/App.tsx \
  web/src/components/layout/Sidebar.tsx web/src/components/layout/CalendarHeatmap.tsx
git commit -m "feat(web): calendar month view — the heatmap's big sibling, with memos in the cells"
```

---

### Task 4: Streaks + ship v1.22.0

**Files:**
- Modify: `web/src/components/layout/CalendarHeatmap.tsx` (streak line),
  `web/src/pages/Calendar.tsx` (streak in the header)
- Create: `docs/changelog/v1.22.0.md`

- [ ] **Step 1: Add the streak line to the sidebar**

Under the heatmap grid in `CalendarHeatmap.tsx`, render a single line when
`current > 0`:

```tsx
{streak.current > 0 ? (
  <p className="mt-1.5 px-1 text-[11px] font-semibold text-muted-foreground">
    🔥 {streak.current}-day streak
    {streak.longest > streak.current ? (
      <span className="font-normal text-muted-foreground/70"> · best {streak.longest}</span>
    ) : null}
  </p>
) : null}
```

with `const streak = useMemo(() => streakFrom(stats?.memoCreatedTimestamps ?? [], new Date()), [stats]);`.
Nothing renders at zero — a new reef shouldn't be told it has no streak.

- [ ] **Step 2: Show it on the calendar page too**

In the `/calendar` header, next to the month's memo count, render the same streak
text (reuse the identical `streakFrom` call). Keep the copy identical so the two
surfaces never disagree.

- [ ] **Step 3: Full green check**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all suites PASS (server 183, web 27 + the new time-travel cases, shared 29).

- [ ] **Step 4: Browser smoke**

`pnpm dev`, then via chrome-devtools MCP against `http://localhost:5173`:
1. Sign in; confirm the sidebar shows **Calendar** and (if applicable) a streak line.
2. Open `/calendar` — current month renders, today ringed, memo lines in cells.
3. Click a day → `?day=` in the URL, memos listed below, `MemoCard` actions work.
4. `‹`/`›` change the month and the URL; `Today` returns.
5. Heatmap month label opens `/calendar?month=…` on the same month.
6. Home: if the reef has an anniversary, the **On this day** card appears; collapse
   it, reload, confirm it stays collapsed; expand again.
7. Check the console for React key/act warnings — must be clean.

- [ ] **Step 5: Release**

```bash
pnpm release minor          # scaffolds docs/changelog/v1.22.0.md
```

Fill BOTH sections of `docs/changelog/v1.22.0.md`:

```md
## What's new
- **A calendar for your reef.** A new Calendar page lays your memos out month by
  month — click any day to read (and edit) everything you wrote then.
- **On this day.** Home now resurfaces what you wrote a month, six months or a year
  ago, when there's something to find.
- **Streaks.** A quiet line under the mini-calendar counts the days you've written in
  a row, and remembers your best run.

## Technical notes
- New `web/src/lib/time-travel.ts` centralises local-calendar math (`localDayKey`,
  `dayRange`, `monthRange`, `anniversaryAnchors`, `anchorsToFilter`, `streakFrom`)
  with a vitest suite; `CalendarHeatmap` now imports `localDayKey` instead of
  keeping its own copy.
- Zero new server surface: both features are memo-list queries carrying
  `created_ts` range filters, so the Dory guard, bottle guard and comment exclusion
  are inherited from `buildMemoListWhere`. The timezone stays in the browser (same
  reasoning as the `displayTime` chip) so historical DST offsets stay correct.
- `/calendar` is a lazy route (its own Vite chunk), state in the URL
  (`?month=YYYY-MM&day=YYYY-MM-DD`), capped at `MAX_PAGE_SIZE` memos per month.
```

Then:

```bash
pnpm release minor          # second run: bump + commit + tag
git push --follow-tags
```

- [ ] **Step 6: Watch the deploy and live-verify**

Poll `https://demo.trynemomemo.com/api/v1/instance/profile` until `version` reads
`1.22.0` (~4–8 min), then on demo: open `/calendar`, step a month, click a day,
and confirm Home behaves. Do not create content on `david.trynemomemo.com`.

---

# RELEASE v1.23.0 — Quick hands

### Task 5: Go fish — `GET /api/v1/memos/random`

**Files:**
- Modify: `server/src/routes/memos.ts` (register **before** `/:uid`)
- Test: `server/src/test/memos.test.ts`
- Modify: `web/src/hooks/queries.ts`, `web/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `buildMemoListWhere`, `rawToMemoRow`, `buildMemoDtos`, `requireViewer`.
- Produces: `GET /api/v1/memos/random` → `{ memo: MemoDto }` or 404
  `{ error: { code: 'NOT_FOUND', message: 'Nothing to fish for yet' } }`;
  web hook `useRandomMemo()` → `UseMutationResult<MemoDto, Error, void>`.

- [ ] **Step 1: Write the failing tests**

Add to `server/src/test/memos.test.ts` (follow the file's existing `makeTestApp()` /
`app.request()` idiom — read a neighbouring test first for the auth-cookie helper):

```ts
describe('GET /api/v1/memos/random', () => {
  it('returns one of the viewer\'s own memos', async () => {
    // create 3 memos as alice
    // GET /api/v1/memos/random 20 times; every uid returned is one of the 3
  });

  it('404s for an empty reef', async () => {
    // fresh user, no memos -> 404 NOT_FOUND
  });

  it('never returns an expired Dory memo', async () => {
    // one memo with forget_at in the past, one normal -> only the normal one, 20 draws
  });

  it('never returns a bottle still at sea', async () => {
    // one memo with surface_at in the future, one normal -> only the normal one
  });

  it('never returns a comment', async () => {
    // memo + comment on it -> only the parent memo, 20 draws
  });

  it('never returns another user\'s memo', async () => {
    // bob has a PUBLIC memo; alice has one; alice's draws are always alice's
  });

  it('requires a viewer', async () => {
    // no cookie -> 401
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/memos.test.ts -t random`
Expected: FAIL — 404 for every case (the path currently falls through to `/:uid`
with uid `random`).

- [ ] **Step 3: Implement the route**

In `server/src/routes/memos.ts`, immediately after the `/dory` handler (both are
static paths that must precede `/:uid`):

```ts
// ---------- Go fish ----------
// One random memo from the viewer's own reef. Guards come from
// buildMemoListWhere, so a fished memo can never be an expired Dory memo,
// a bottle still at sea, or a comment.
// Static path: MUST stay registered before '/:uid'.
app.get('/random', (c) => {
  const viewer = requireViewer(c);
  const built = buildMemoListWhere(
    db,
    { viewer, allowAnonymous: allowAnonymous(), state: 'NORMAL', scope: 'home' },
    nowSeconds(),
  );
  if (!built) throw apiError('NOT_FOUND', 'Nothing to fish for yet');
  const raw = db.$client
    .prepare(`SELECT memo.* FROM memo WHERE ${built.where.join(' AND ')} ORDER BY RANDOM() LIMIT 1`)
    .get(...(built.params as never[])) as Record<string, unknown> | undefined;
  if (!raw) throw apiError('NOT_FOUND', 'Nothing to fish for yet');
  return c.json({ memo: buildMemoDtos(db, [rawToMemoRow(raw)], viewer)[0] });
});
```

Add `buildMemoListWhere` to the existing `../services/memo-service.js` import list.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nemomemo/server exec vitest run src/test/memos.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the web side**

`web/src/hooks/queries.ts` — next to the other memo hooks:

```ts
export function useRandomMemo() {
  return useMutation({
    mutationFn: async () => (await api<{ memo: MemoDto }>('GET', '/api/v1/memos/random')).memo,
  });
}
```

`Sidebar.tsx` — a button in the authenticated nav block, styled like `NavItem` but
as a `<button>` (it navigates imperatively):

```tsx
<button
  onClick={() => goFish.mutate(undefined, {
    onSuccess: (memo) => navigate(`/memos/${memo.uid}`),
  })}
  disabled={goFish.isPending}
  className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
>
  <Shuffle className="size-4" />
  <span className="flex-1 text-left">Go fish</span>
</button>
```

On error (empty reef), do nothing visible beyond leaving the button enabled — an
empty reef has no memo to show and a toast would be noise.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/memos.ts server/src/test/memos.test.ts \
  web/src/hooks/queries.ts web/src/components/layout/Sidebar.tsx
git commit -m "feat: Go fish — one random memo from your own reef, guards inherited"
```

---

### Task 6: Pinned tags in the sidebar

**Files:**
- Modify: `shared/src/schemas/index.ts`, `web/src/components/layout/TagTree.tsx`
- Test: `server/src/test/memos.test.ts` (settings round trip lives with the other
  `/users/-/settings` tests — grep for `updateUserSettings` / `'/-/settings'` to find
  the right file first; use whichever suite already covers user settings)

**Interfaces:**
- Consumes: `useUserSettings`, `useUpdateUserSettings` (existing hooks — confirm the
  exact names in `web/src/hooks/queries.ts`), `useTags`.
- Produces: `userGeneralSettingSchema.pinnedTags: string[]` (max 20, default `[]`),
  persisted through the existing `PATCH /api/v1/users/-/settings` body
  `{ general: { pinnedTags } }`.

- [ ] **Step 1: Write the failing test**

In the suite that already covers `PATCH /api/v1/users/-/settings`:

```ts
it('round-trips pinned tags', async () => {
  // PATCH { general: { pinnedTags: ['reef', 'reef/coral'] } } -> 200
  // GET /-/settings -> general.pinnedTags equals ['reef', 'reef/coral']
});

it('defaults pinned tags to an empty list', async () => {
  // GET /-/settings on a fresh user -> general.pinnedTags is []
});

it('rejects more than 20 pinned tags', async () => {
  // PATCH with 21 entries -> 400 INVALID_ARGUMENT
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nemomemo/server exec vitest run -t "pinned tags"`
Expected: FAIL — `pinnedTags` is stripped by the schema.

- [ ] **Step 3: Extend the schema**

`shared/src/schemas/index.ts`:

```ts
export const userGeneralSettingSchema = z.object({
  defaultVisibility: z.enum(VISIBILITIES).default('PRIVATE'),
  theme: z.enum(['system', 'shallows', 'deep-sea']).default('system'),
  /** Tags the member keeps at the top of the sidebar. */
  pinnedTags: z.array(z.string().min(1).max(128)).max(20).default([]),
});
```

Nothing else on the server changes: `setUserGeneral` already merges + reparses, and
`updateUserSettingsRequestSchema` picks it up through `.partial()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nemomemo/server exec vitest run && pnpm --filter @nemomemo/shared exec vitest run`
Expected: PASS.

- [ ] **Step 5: Build the UI**

In `TagTree.tsx`:
- Read `pinnedTags` from `useUserSettings`; `const pinned = (settings?.general?.pinnedTags ?? []).filter((tag) => tag in (tags ?? {}))`
  — a pinned tag whose last memo is gone silently drops out of the list rather than
  rendering a dead row (leave the stored value alone; renaming or re-adding the tag
  brings it back).
- Render a `Pinned` section above the `Tags` header when `pinned.length > 0`, using
  the same row markup as the flat list (star icon in place of the count is wrong —
  keep the count, it's useful).
- Every tag row (pinned or not) gets a pin toggle that appears on hover/focus:
  `<Star className="size-3" />` filled when pinned. Clicking it calls the update
  mutation with the next array and **must not** also toggle the tag filter
  (`event.stopPropagation()` + the toggle is a sibling button, not nested inside the
  row button — nested buttons are invalid HTML).
- Optimistic feel comes free from TanStack Query's invalidation; no local mirror
  state.

- [ ] **Step 6: Verify + commit**

Run: `pnpm typecheck && pnpm test`

```bash
git add shared/src/schemas/index.ts server/src/test web/src/components/layout/TagTree.tsx
git commit -m "feat: pin tags to the top of the sidebar"
```

---

### Task 7: Keyboard shortcuts

**Files:**
- Create: `web/src/hooks/use-shortcuts.ts`, `web/src/components/ShortcutsDialog.tsx`
- Modify: `web/src/components/layout/AppShell.tsx`,
  `web/src/components/memo/MemoCard.tsx`,
  `web/src/components/editor/MemoEditor.tsx`

**Interfaces:**
- Consumes: `useNavigate`, `useLocation` (react-router), the `Dialog` wrapper in
  `@/components/ui/overlays.js`.
- Produces:
  - `useShortcuts(opts: { onSearch: () => void; onHelp: () => void }): void` — mounts
    one `keydown` listener on `window`.
  - `<ShortcutsDialog open onOpenChange />`.
  - DOM contract: `MemoCard`'s root element carries `data-memo-card` and
    `tabIndex={-1}`; its edit control carries `data-memo-edit`.
  - Window event `nemo:compose` — `MemoEditor` focuses itself when it fires.

- [ ] **Step 1: The guard rules (write these first — they're the whole feature)**

`use-shortcuts.ts` ignores a keystroke when ANY of these hold:
- `event.metaKey || event.ctrlKey || event.altKey` (leave OS/browser combos alone;
  ⌘K stays in `AppShell` where it already lives).
- The event target is an `input`, `textarea`, `select`, or anything with
  `isContentEditable` (TipTap is contenteditable — this is what keeps `c` from
  appearing in a half-written memo).
- `document.querySelector('[role="dialog"]')` is present (a dialog owns the keyboard).
- `event.target` is inside `[data-no-shortcuts]` (escape hatch for future widgets).

- [ ] **Step 2: The bindings**

| Key | Action |
| --- | --- |
| `c` | `window.dispatchEvent(new Event('nemo:compose'))`; if not on `/`, `navigate('/')` first and dispatch on the next frame (`requestAnimationFrame`). |
| `/` | `event.preventDefault()` then `onSearch()` (same dialog ⌘K opens). |
| `j` | Focus the next `[data-memo-card]` in document order (first one if none focused), `scrollIntoView({ block: 'nearest' })`. |
| `k` | Same, previous. |
| `e` | If a `[data-memo-card]` has focus, click its `[data-memo-edit]` child. |
| `Enter` | If a `[data-memo-card]` has focus and it carries `data-memo-uid`, `navigate('/memos/' + uid)`. |
| `?` | `onHelp()` — opens the cheat sheet. (Note: `?` is Shift+/, so check `event.key === '?'` before the `/` branch.) |
| `Escape` | Blur the focused memo card. |

Focus tracking needs no state: `document.activeElement?.closest('[data-memo-card]')`
is the cursor. That keeps the hook stateless and immune to feed re-renders.

- [ ] **Step 3: The DOM contract**

- `MemoCard.tsx`: add `data-memo-card`, `data-memo-uid={memo.uid}`, `tabIndex={-1}`,
  and a focus ring (`focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`
  — plus `data-[focused]` is unnecessary; `:focus` on a `tabIndex={-1}` element is
  reliable here) to the card's root element. Tag the edit control with
  `data-memo-edit` (find it in the card's action menu; if editing opens from the
  `MemoActionMenu`, put the attribute on the menu's Edit item's trigger path that
  works without opening the menu — if there is no such control, add a hidden
  `<button data-memo-edit className="sr-only" onClick={startEdit}>Edit</button>`
  inside the card and let the shortcut click that).
- `MemoEditor.tsx`: in a `useEffect`, listen for `nemo:compose` and focus the editor
  (`editor?.commands.focus('end')` — confirm the TipTap instance's name in the file).
  Remove the listener on unmount.

- [ ] **Step 4: The cheat sheet**

`ShortcutsDialog.tsx` — a `Dialog` listing the table above in two columns, with a
`<kbd>` style (`rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]`).
Include ⌘K. Title: `Keyboard shortcuts`. Footer line in reef voice: `Press ? any time
to see this again.`

- [ ] **Step 5: Mount in AppShell**

Add `const [helpOpen, setHelpOpen] = useState(false)` and
`useShortcuts({ onSearch: () => setSearchOpen(true), onHelp: () => setHelpOpen(true) })`,
then render `<ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />` next to
`<SearchDialog />`. Leave the existing ⌘K effect exactly as it is.

- [ ] **Step 6: Verify + commit**

Run: `pnpm typecheck && pnpm test && pnpm build`

```bash
git add web/src/hooks/use-shortcuts.ts web/src/components/ShortcutsDialog.tsx \
  web/src/components/layout/AppShell.tsx web/src/components/memo/MemoCard.tsx \
  web/src/components/editor/MemoEditor.tsx
git commit -m "feat(web): keyboard shortcuts — c compose, / search, j/k feed, e edit, ? cheat sheet"
```

---

### Task 8: Docs + ship v1.23.0

**Files:**
- Modify: `site/content/docs/memos.mdx`
- Create: `docs/changelog/v1.23.0.md`

- [ ] **Step 1: Document the shortcuts**

Add a `## Keyboard shortcuts` section near the end of `site/content/docs/memos.mdx`
(read the file first and match its heading level, component usage, and voice) with a
table of the eight bindings from Task 7 plus ⌘K, and one line noting they're off
while you're typing in the editor.

- [ ] **Step 2: Browser smoke**

`pnpm dev`, then via chrome-devtools MCP:
1. `c` from anywhere → lands on Home with the editor focused; typing goes into the
   memo, and pressing `c` *inside* the editor types a `c` (the guard works).
2. `/` opens search; `Escape` closes; ⌘K still works.
3. `j`/`k` walk the feed with a visible focus ring and scroll into view; `Enter`
   opens the focused memo; `e` starts editing it.
4. `?` opens the cheat sheet; `Escape` closes it; keys do nothing while it's open.
5. Sidebar **Go fish** navigates to a random memo; repeat 5× and confirm variety.
6. Hover a tag → star appears; pin two tags; they surface in a **Pinned** section;
   reload persists; unpin removes.
7. Console clean.

- [ ] **Step 3: Full green + release**

```bash
pnpm typecheck && pnpm test && pnpm build
pnpm release minor          # scaffolds docs/changelog/v1.23.0.md
```

Fill BOTH sections:

```md
## What's new
- **Keyboard shortcuts.** Press `c` to start writing, `/` to search, `j`/`k` to move
  through your feed, `e` to edit, and `?` any time for the full list.
- **Go fish.** A button in the sidebar swims up a random memo from your reef.
- **Pin your tags.** Star the tags you use most and they stay at the top of the
  sidebar.

## Technical notes
- `GET /api/v1/memos/random` builds its WHERE through `buildMemoListWhere` and picks
  with `ORDER BY RANDOM() LIMIT 1`, so expired Dory memos, bottles still at sea, and
  comments can't be fished; registered before `/:uid` (route-order trap).
- `pinnedTags` (max 20) added to `userGeneralSettingSchema`; no migration — user
  settings are JSON, and `setUserGeneral` merges + reparses.
- Shortcuts live in one `window` keydown listener (`web/src/hooks/use-shortcuts.ts`)
  that bails on modifier keys, editable targets (TipTap is contenteditable), and any
  open `[role="dialog"]`. Feed focus is read from the DOM
  (`document.activeElement.closest('[data-memo-card]')`) rather than React state.
```

```bash
pnpm release minor          # second run: bump + commit + tag
git push --follow-tags
```

- [ ] **Step 4: Watch the deploy and live-verify**

Poll `https://demo.trynemomemo.com/api/v1/instance/profile` for `1.23.0`, then smoke
the shortcuts, Go fish, and tag pinning on demo.

---

## Out of scope (deliberately)

- bm25 relevance ordering for search (still tabled).
- Bulk select, memo templates, tag rename/merge UI — those are Wave 3, after Trash.
- A server-side "on this day" endpoint: the timezone belongs to the browser, and the
  existing list route already carries every guard.
