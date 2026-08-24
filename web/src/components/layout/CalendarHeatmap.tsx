import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';
import { useUserStats } from '@/hooks/queries.js';
import { localDayKey } from '@/lib/time-travel.js';
import { cn } from '@/lib/utils.js';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarHeatmap({ username }: { username: string }) {
  const { data: stats } = useUserStats(username);
  const { chips, toggleChip } = useMemoFilters();
  const [monthOffset, setMonthOffset] = useState(0);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ts of stats?.memoCreatedTimestamps ?? []) {
      const key = localDayKey(new Date(ts * 1000));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [stats]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const leadingBlanks = monthStart.getDay();
  const max = Math.max(1, ...counts.values());
  const selectedDay = chips.find((chip) => chip.type === 'displayTime')?.value;
  const todayKey = localDayKey(now);

  return (
    <section aria-label="Activity" className="select-none">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-bold text-muted-foreground">{monthLabel}</span>
        <span className="flex gap-0.5">
          <button
            aria-label="Previous month"
            className="rounded-md p-0.5 text-muted-foreground hover:bg-accent"
            onClick={() => setMonthOffset((offset) => offset - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            aria-label="Next month"
            className="rounded-md p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
            disabled={monthOffset >= 0}
            onClick={() => setMonthOffset((offset) => offset + 1)}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Calendar for ${monthLabel}`}>
        {WEEKDAYS.map((day, i) => (
          <span key={i} className="text-center text-[10px] font-bold text-muted-foreground/70">
            {day}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => {
          const day = new Date(monthStart.getFullYear(), monthStart.getMonth(), i - leadingBlanks + 1);
          return (
            <span
              key={`lead-${i}`}
              aria-hidden
              className="flex aspect-square items-center justify-center text-[11px] tabular-nums text-muted-foreground/40"
            >
              {day.getDate()}
            </span>
          );
        })}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
          const key = localDayKey(date);
          const count = counts.get(key) ?? 0;
          const intensity =
            count === 0
              ? ''
              : count / max > 0.75
                ? 'bg-ocean/60'
                : count / max > 0.5
                  ? 'bg-ocean/45'
                  : count / max > 0.25
                    ? 'bg-ocean/30'
                    : 'bg-ocean/15';
          return (
            <button
              key={key}
              aria-label={count > 0 ? `${count} memos on ${key}` : key}
              aria-pressed={selectedDay === key}
              onClick={() => toggleChip({ type: 'displayTime', value: key })}
              className={cn(
                'relative aspect-square rounded-md text-[11px] tabular-nums text-foreground/80 hover:bg-accent',
                intensity,
                selectedDay === key && 'ring-2 ring-inset ring-primary',
              )}
            >
              {i + 1}
              {key === todayKey ? (
                <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
              ) : null}
            </button>
          );
        })}
        {Array.from({ length: (7 - ((leadingBlanks + daysInMonth) % 7)) % 7 }, (_, i) => (
          <span
            key={`trail-${i}`}
            aria-hidden
            className="flex aspect-square items-center justify-center text-[11px] tabular-nums text-muted-foreground/40"
          >
            {i + 1}
          </span>
        ))}
      </div>
    </section>
  );
}
