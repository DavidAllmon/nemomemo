import { CheckSquare, Link2, Pin } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { FilterChipBar } from '@/components/filters/FilterChipBar.js';
import { CalendarHeatmap } from '@/components/layout/CalendarHeatmap.js';
import { MemoFeed } from '@/components/memo/MemoFeed.js';
import { Avatar } from '@/components/ui/misc.js';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';
import { useUser, useUserStats } from '@/hooks/queries.js';
import { cn } from '@/lib/utils.js';

const MAX_PROFILE_TAGS = 14;

export function ProfilePage() {
  const { username = '' } = useParams();
  const { data: user, isLoading, isError } = useUser(username);
  const { data: stats } = useUserStats(username);
  const { chips, expression, toggleChip } = useMemoFilters();

  if (isLoading) return <LoadingState />;
  if (isError || !user) {
    return <EmptyState title="This fish swam away" hint="No such user on this reef." />;
  }

  const joined = new Date(user.createdTs * 1000).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const topTags = Object.entries(stats?.tagCounts ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_PROFILE_TAGS);
  const activeTag = chips.find((chip) => chip.type === 'tagSearch')?.value;

  const statChip = (icon: React.ReactNode, label: string) => (
    <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      {icon}
      {label}
    </span>
  );

  return (
    <div>
      <header className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <Avatar name={user.nickname} avatarUrl={user.avatarUrl} className="size-16 text-2xl" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold">{user.nickname}</h1>
            <p className="text-sm text-muted-foreground">
              @{user.username} · swimming here since {joined}
              {stats ? ` · ${stats.totalMemoCount} ${stats.totalMemoCount === 1 ? 'memo' : 'memos'}` : ''}
            </p>
            {user.description ? <p className="mt-1 text-sm">{user.description}</p> : null}
          </div>
        </div>
        {stats && (stats.linkCount > 0 || stats.taskCount > 0 || stats.pinnedCount > 0) ? (
          <div className="flex flex-wrap gap-1.5">
            {stats.linkCount > 0
              ? statChip(<Link2 className="size-3" />, `${stats.linkCount} ${stats.linkCount === 1 ? 'link' : 'links'}`)
              : null}
            {stats.taskCount > 0
              ? statChip(
                  <CheckSquare className="size-3" />,
                  `${stats.taskCount - stats.incompleteTaskCount}/${stats.taskCount} tasks done`,
                )
              : null}
            {stats.pinnedCount > 0
              ? statChip(<Pin className="size-3" />, `${stats.pinnedCount} pinned`)
              : null}
          </div>
        ) : null}
        {topTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {topTags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => toggleChip({ type: 'tagSearch', value: tag })}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
                  activeTag === tag
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                #{tag} <span className="opacity-60">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
        {stats && stats.memoCreatedTimestamps.length > 0 ? (
          <div className="w-fit max-w-full rounded-xl border border-border p-3">
            <div className="w-64">
              <CalendarHeatmap username={username} />
            </div>
          </div>
        ) : null}
      </header>
      <FilterChipBar />
      <MemoFeed
        params={{ scope: 'profile', creator: username, filter: expression }}
        emptyTitle="No memos to see here"
        emptyHint={`${user.nickname} hasn't shared anything yet.`}
      />
    </div>
  );
}
