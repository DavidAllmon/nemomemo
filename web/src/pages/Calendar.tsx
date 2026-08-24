import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MemoDto } from '@nemomemo/shared';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { useMemoList, useUserStats, useViewer } from '@/hooks/queries.js';
import { localDayKey, monthRange, streakFrom } from '@/lib/time-travel.js';
import { cn } from '@/lib/utils.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_PAGE_SIZE = 200; // MAX_PAGE_SIZE — a calendar doesn't paginate
const CELL_LINES = 3;

/** First line worth showing, with the markdown scaffolding filed off. */
function headline(content: string): string {
  for (const raw of content.split('\n')) {
    const line = raw
      .replace(/^\s*>+\s*/, '')
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/^\s*[-*+]\s+(\[[ xX]\]\s*)?/, '')
      .replace(/^\s*\d+\.\s+/, '')
      .trim();
    if (line) return line;
  }
  return '(no words — just an attachment)';
}

function parseMonth(param: string | null): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(param ?? '');
  const now = new Date();
  if (!match) return { year: now.getFullYear(), month: now.getMonth() };
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return { year: now.getFullYear(), month: now.getMonth() };
  return { year, month };
}

const monthParam = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}`;

/**
 * The heatmap's big sibling: a month laid out as a calendar, with the memos
 * themselves in the cells. One memo-list query per month carrying a `created_ts`
 * range, so every guard comes from `buildMemoListWhere`; the local timezone
 * stays in the browser (see lib/time-travel.ts).
 */
export function CalendarPage() {
  const { data: viewer } = useViewer();
  const { data: stats } = useUserStats(viewer?.username ?? '');
  const [searchParams, setSearchParams] = useSearchParams();

  const { year, month } = parseMonth(searchParams.get('month'));
  const selectedDay = searchParams.get('day');
  const range = useMemo(() => monthRange(year, month), [year, month]);

  const { data, isLoading } = useMemoList({
    scope: 'home',
    filter: `created_ts >= ${range.start} && created_ts < ${range.end}`,
    pageSize: MONTH_PAGE_SIZE,
  });

  const memos = useMemo(() => data?.pages.flatMap((page) => page.memos) ?? [], [data]);
  const truncated = Boolean(data?.pages.at(-1)?.nextPageToken);

  /** day key -> that day's memos, oldest first (the feed's pinned-first order is undone here). */
  const byDay = useMemo(() => {
    const map = new Map<string, MemoDto[]>();
    for (const memo of memos) {
      const key = localDayKey(new Date(memo.createdTs * 1000));
      const bucket = map.get(key);
      if (bucket) bucket.push(memo);
      else map.set(key, [memo]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.createdTs - b.createdTs);
    return map;
  }, [memos]);

  const streak = useMemo(
    () => streakFrom(stats?.memoCreatedTimestamps ?? [], new Date()),
    [stats],
  );

  const monthStart = new Date(year, month, 1);
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = monthStart.getDay();
  const trailingBlanks = (7 - ((leadingBlanks + daysInMonth) % 7)) % 7;
  const todayKey = localDayKey(new Date());

  const goToMonth = (delta: number) => {
    const target = new Date(year, month + delta, 1);
    setSearchParams({ month: monthParam(target.getFullYear(), target.getMonth()) });
  };

  const goToToday = () => {
    const now = new Date();
    setSearchParams({
      month: monthParam(now.getFullYear(), now.getMonth()),
      day: localDayKey(now),
    });
  };

  const selectDay = (key: string) => {
    const next: Record<string, string> = { month: monthParam(year, month) };
    if (key !== selectedDay) next.day = key;
    setSearchParams(next);
  };

  // No day picked yet? The space under the grid shows the whole month as a
  // timeline — a calendar you can read, not just look at.
  const listed = useMemo(
    () =>
      selectedDay
        ? (byDay.get(selectedDay) ?? [])
        : [...memos].sort((a, b) => a.createdTs - b.createdTs),
    [byDay, memos, selectedDay],
  );
  const listedLabel = selectedDay
    ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : `All of ${monthLabel}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-lg font-bold">{monthLabel}</h1>
        <div className="flex items-center gap-0.5">
          <button
            aria-label="Previous month"
            onClick={() => goToMonth(-1)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            aria-label="Next month"
            onClick={() => goToMonth(1)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            onClick={goToToday}
            className="ml-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Today
          </button>
        </div>
        <p className="ml-auto text-xs font-semibold text-muted-foreground">
          {memos.length} {memos.length === 1 ? 'memo' : 'memos'}
          {streak.current > 0 ? (
            <span className="ml-2">🔥 {streak.current}-day streak</span>
          ) : null}
        </p>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-7 border-b border-border bg-muted/40">
              {WEEKDAYS.map((day) => (
                <span
                  key={day}
                  className="py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  <span className="sm:hidden">{day[0]}</span>
                  <span className="hidden sm:inline">{day}</span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: leadingBlanks }, (_, index) => (
                <span key={`lead-${index}`} aria-hidden className="min-h-16 border-b border-r border-border sm:min-h-28" />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const dayNumber = index + 1;
                const key = localDayKey(new Date(year, month, dayNumber));
                const dayMemos = byDay.get(key) ?? [];
                const isToday = key === todayKey;
                const isSelected = key === selectedDay;
                return (
                  <button
                    key={key}
                    onClick={() => selectDay(key)}
                    aria-pressed={isSelected}
                    aria-label={
                      dayMemos.length === 0
                        ? `${key}: nothing written`
                        : `${key}: ${dayMemos.length} ${dayMemos.length === 1 ? 'memo' : 'memos'}`
                    }
                    className={cn(
                      'flex min-h-16 flex-col items-stretch gap-1 border-b border-r border-border p-1.5 text-left align-top transition-colors hover:bg-accent sm:min-h-28',
                      isSelected && 'bg-ocean-soft ring-2 ring-inset ring-primary',
                    )}
                  >
                    <span className="flex items-center gap-1">
                      <span
                        className={cn(
                          'text-xs font-semibold tabular-nums',
                          isToday
                            ? 'flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground'
                            : 'text-foreground/80',
                        )}
                      >
                        {dayNumber}
                      </span>
                      {dayMemos.length > 0 ? (
                        <span className="text-[10px] font-bold text-ocean sm:hidden">
                          {dayMemos.length}
                        </span>
                      ) : null}
                    </span>
                    <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                      {dayMemos.slice(0, CELL_LINES).map((memo) => (
                        <span
                          key={memo.uid}
                          className="truncate rounded bg-ocean-soft px-1 py-0.5 text-[10px] leading-tight text-ocean"
                        >
                          {headline(memo.content)}
                        </span>
                      ))}
                      {dayMemos.length > CELL_LINES ? (
                        <span className="px-1 text-[10px] font-semibold text-muted-foreground">
                          +{dayMemos.length - CELL_LINES} more
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {Array.from({ length: trailingBlanks }, (_, index) => (
                <span key={`trail-${index}`} aria-hidden className="min-h-16 border-b border-r border-border sm:min-h-28" />
              ))}
            </div>
          </div>

          {truncated ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Showing the first {MONTH_PAGE_SIZE} memos this month — a busy one. 🐠
            </p>
          ) : null}

          <section className="mx-auto mt-6 max-w-2xl" aria-label={listedLabel}>
            <h2 className="mb-2 font-display text-sm font-bold text-muted-foreground">
              {listedLabel}
            </h2>
            {listed.length === 0 ? (
              <EmptyState
                title={selectedDay ? 'Nothing on this day' : 'Nothing this month'}
                hint="Quiet water. Swim to another day, or write something now. 🫧"
              />
            ) : (
              <div className="flex flex-col gap-3">
                {listed.map((memo) => (
                  <MemoCard key={memo.uid} memo={memo} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
