import { ChevronDown, Shell } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { useMemoList } from '@/hooks/queries.js';
import { anchorsToFilter, anniversaryAnchors } from '@/lib/time-travel.js';
import { cn } from '@/lib/utils.js';

/** How much of Home this card is allowed to take before it stops being a nudge. */
const MAX_ANCHORS = 2;
const MAX_PER_ANCHOR = 2;

const STORAGE_KEY = 'nemo-on-this-day';

/**
 * What you wrote a month, six months or a year ago today.
 *
 * One memo-list query carrying an OR of one-day `created_ts` ranges, so the Dory
 * guard, the bottle guard and the comment exclusion all come from
 * `buildMemoListWhere` on the server. Renders nothing at all when there's nothing
 * to resurface — this card never appears as an empty shell.
 */
export function OnThisDay() {
  const anchors = useMemo(() => anniversaryAnchors(new Date()), []);
  const { data } = useMemoList({ scope: 'home', filter: anchorsToFilter(anchors) });
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const groups = useMemo(() => {
    const memos = data?.pages.flatMap((page) => page.memos) ?? [];
    if (memos.length === 0) return [];
    return anchors
      .map((anchor) => ({
        anchor,
        memos: memos.filter(
          (memo) => memo.createdTs >= anchor.start && memo.createdTs < anchor.end,
        ),
      }))
      .filter((group) => group.memos.length > 0)
      .slice(0, MAX_ANCHORS);
  }, [anchors, data]);

  if (groups.length === 0) return null;

  const toggle = () => {
    setCollapsed((previous) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(!previous));
      } catch {
        // storage unavailable: the card just won't remember
      }
      return !previous;
    });
  };

  return (
    <section aria-label="On this day" className="mb-4 rounded-2xl border border-border bg-card p-4">
      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 text-left"
      >
        <Shell className="size-4 text-ocean" />
        <span className="font-display text-sm font-bold">On this day</span>
        <span className="text-xs text-muted-foreground">
          {groups.map((group) => group.anchor.label.toLowerCase()).join(' · ')}
        </span>
        <ChevronDown
          className={cn(
            'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
            collapsed && '-rotate-90',
          )}
        />
      </button>

      {collapsed ? null : (
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.anchor.key}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {group.anchor.label}
              </p>
              <div className="flex flex-col gap-2">
                {group.memos.slice(0, MAX_PER_ANCHOR).map((memo) => (
                  <MemoCard key={memo.uid} memo={memo} compact />
                ))}
              </div>
              {group.memos.length > MAX_PER_ANCHOR ? (
                <Link
                  to={`/?filter=displayTime:${group.anchor.key}`}
                  className="mt-1.5 inline-block text-xs font-semibold text-ocean hover:underline"
                >
                  See all {group.memos.length} from {group.anchor.label.toLowerCase()} →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
