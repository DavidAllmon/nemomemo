import { ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listTaskItems, toggleTaskAt, type MemoDto, type TaskItem } from '@nemomemo/shared';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { Button } from '@/components/ui/button.js';
import { useMemoList, useUpdateMemo } from '@/hooks/queries.js';
import { relativeTime } from '@/lib/utils.js';

/** The text of the task's own line, sans the `[ ]` marker. */
function taskLabel(content: string, item: TaskItem): string {
  const afterMarker = item.markerOffset + 3;
  const eol = content.indexOf('\n', afterMarker);
  return content.slice(afterMarker, eol === -1 ? undefined : eol).trim();
}

function MemoTaskGroup({ memo, open }: { memo: MemoDto; open: TaskItem[] }) {
  const update = useUpdateMemo();
  const busy = update.isPending;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {open.length} open {open.length === 1 ? 'task' : 'tasks'}
        </span>
        <Link to={`/memos/${memo.uid}`} className="hover:text-foreground hover:underline">
          {relativeTime(memo.createdTs)}
        </Link>
      </header>
      <ul className="flex flex-col gap-1.5">
        {open.map((item) => (
          <li key={item.markerOffset} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={false}
              disabled={busy}
              aria-label={`Mark "${taskLabel(memo.content, item)}" done`}
              onChange={() =>
                update.mutate({
                  uid: memo.uid,
                  content: toggleTaskAt(memo.content, item.markerOffset, true),
                })
              }
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)] disabled:opacity-70"
            />
            <span className="text-[15px] leading-snug">{taskLabel(memo.content, item)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TasksPage() {
  const query = useMemoList({ scope: 'home', filter: 'has_incomplete_tasks' });

  const memos: MemoDto[] = query.data?.pages.flatMap((page) => page.memos) ?? [];
  const groups = memos
    .map((memo) => ({ memo, open: listTaskItems(memo.content).filter((item) => !item.checked) }))
    .filter((group) => group.open.length > 0);
  const total = groups.reduce((count, group) => count + group.open.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <ListChecks className="size-5 text-ocean" /> Open tasks
        </h1>
        <p className="text-sm text-muted-foreground">
          {total > 0
            ? `${total} unchecked ${total === 1 ? 'task' : 'tasks'} across your reef — tick them off right here.`
            : 'Every unchecked task from all your memos gathers here.'}
        </p>
      </header>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <EmptyState title="The current swept that away" hint={String(query.error)} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="All clear!"
          hint="No open tasks anywhere in your reef. Just keep swimming 🫧"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <MemoTaskGroup key={group.memo.uid} memo={group.memo} open={group.open} />
          ))}
        </div>
      )}

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Swimming…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
