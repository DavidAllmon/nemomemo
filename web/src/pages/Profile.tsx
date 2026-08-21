import { useParams } from 'react-router-dom';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { FilterChipBar } from '@/components/filters/FilterChipBar.js';
import { MemoFeed } from '@/components/memo/MemoFeed.js';
import { Avatar } from '@/components/ui/misc.js';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';
import { useUser, useUserStats } from '@/hooks/queries.js';

export function ProfilePage() {
  const { username = '' } = useParams();
  const { data: user, isLoading, isError } = useUser(username);
  const { data: stats } = useUserStats(username);
  const { expression } = useMemoFilters();

  if (isLoading) return <LoadingState />;
  if (isError || !user) {
    return <EmptyState title="This fish swam away" hint="No such user on this reef." />;
  }

  return (
    <div>
      <header className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <Avatar name={user.nickname} avatarUrl={user.avatarUrl} className="size-12 text-lg" />
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold">{user.nickname}</h1>
          <p className="text-sm text-muted-foreground">
            @{user.username}
            {stats ? ` · ${stats.totalMemoCount} memos` : ''}
          </p>
          {user.description ? <p className="mt-1 text-sm">{user.description}</p> : null}
        </div>
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
