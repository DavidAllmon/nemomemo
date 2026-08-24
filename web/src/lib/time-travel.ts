/**
 * Local-calendar date math for the retrieval features (calendar month view,
 * "On this day", streaks).
 *
 * The browser's zone is the source of truth here — the same reasoning as
 * `chipsToExpression`'s displayTime chip: resolving a calendar day to an epoch
 * range in the browser gives each historical date its own real UTC offset, which
 * a single server-side offset would get wrong on the far side of a DST change.
 */

export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const epoch = (date: Date): number => Math.floor(date.getTime() / 1000);

/** Half-open `[startOfDay, startOfNextDay)` in epoch seconds, local. */
export function dayRange(key: string): { start: number; end: number } {
  const [y, m, d] = key.split('-').map(Number);
  return {
    start: epoch(new Date(y!, m! - 1, d!)),
    end: epoch(new Date(y!, m! - 1, d! + 1)),
  };
}

/** Half-open `[firstOfMonth, firstOfNextMonth)` in epoch seconds, local. */
export function monthRange(year: number, monthIndex: number): { start: number; end: number } {
  return {
    start: epoch(new Date(year, monthIndex, 1)),
    end: epoch(new Date(year, monthIndex + 1, 1)),
  };
}

export interface Anchor {
  /** `YYYY-MM-DD` of the day being resurfaced. */
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

const MONTHS_BACK: [months: number, label: string][] = [
  [1, 'A month ago'],
  [3, '3 months ago'],
  [6, '6 months ago'],
];

const YEARS_BACK = 10;

/** The days worth resurfacing on Home, newest first. */
export function anniversaryAnchors(now: Date): Anchor[] {
  const anchors: Anchor[] = [];
  const push = (date: Date, label: string) => {
    const key = localDayKey(date);
    anchors.push({ key, label, ...dayRange(key) });
  };
  for (const [months, label] of MONTHS_BACK) push(shiftMonths(now, months), label);
  for (let years = 1; years <= YEARS_BACK; years += 1) {
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
 * Consecutive local days carrying at least one memo. `current` counts back from
 * today, or from yesterday when today is still blank — a streak shouldn't read as
 * broken just because you haven't written yet this morning.
 */
export function streakFrom(timestamps: number[], now: Date): { current: number; longest: number } {
  const days = new Set(timestamps.map((ts) => localDayKey(new Date(ts * 1000))));
  if (days.size === 0) return { current: 0, longest: 0 };

  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = dayRange(sorted[index - 1]!).start;
    const current = dayRange(sorted[index]!).start;
    // A local day is 23–25h long across DST changes; under 36h apart is "the next day".
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
