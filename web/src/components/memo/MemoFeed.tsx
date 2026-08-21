import { Settings2 } from 'lucide-react';
import type { MemoDto } from '@nemomemo/shared';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { FilterChipBar } from '@/components/filters/FilterChipBar.js';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { Button } from '@/components/ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays.js';
import { useViewSetting, type ViewSetting } from '@/context/view-setting.js';
import { useMemoList, type MemoListParams } from '@/hooks/queries.js';
import { cn } from '@/lib/utils.js';

export function ViewOptionsButton() {
  const { setting, update } = useViewSetting();
  const layouts: { value: ViewSetting['layout']; label: string }[] = [
    { value: 'list', label: 'List' },
    { value: '2col', label: '2 columns' },
    { value: '3col', label: '3 columns' },
    { value: 'auto', label: 'Auto' },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="View options">
          <Settings2 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Layout</p>
        <div className="mb-3 grid grid-cols-4 gap-0.5 rounded-xl bg-muted p-0.5" role="radiogroup">
          {layouts.map((layout) => (
            <button
              key={layout.value}
              role="radio"
              aria-checked={setting.layout === layout.value}
              onClick={() => update({ layout: layout.value })}
              className={cn(
                'rounded-lg px-1 py-1 text-[11px] font-semibold',
                setting.layout === layout.value ? 'bg-card shadow-sm' : 'text-muted-foreground',
              )}
            >
              {layout.label}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Order</p>
        <div className="flex gap-2">
          <select
            aria-label="Order by"
            value={setting.orderBy}
            onChange={(event) => update({ orderBy: event.target.value as ViewSetting['orderBy'] })}
            className="h-8 flex-1 rounded-lg border border-input bg-card px-2 text-xs"
          >
            <option value="created_ts">Written time</option>
            <option value="updated_ts">Updated time</option>
          </select>
          <select
            aria-label="Direction"
            value={setting.direction}
            onChange={(event) => update({ direction: event.target.value as ViewSetting['direction'] })}
            className="h-8 flex-1 rounded-lg border border-input bg-card px-2 text-xs"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MemoFeed({
  params,
  emptyTitle,
  emptyHint,
}: {
  params: Omit<MemoListParams, 'orderBy' | 'dir'>;
  emptyTitle: string;
  emptyHint?: string;
}) {
  const { setting } = useViewSetting();
  const query = useMemoList({ ...params, orderBy: setting.orderBy, dir: setting.direction });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) {
    return <EmptyState title="The current swept that away" hint={String(query.error)} />;
  }

  const memos: MemoDto[] = query.data?.pages.flatMap((page) => page.memos) ?? [];
  if (memos.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  const columns =
    setting.layout === 'list'
      ? 'grid-cols-1'
      : setting.layout === '2col'
        ? 'sm:grid-cols-2'
        : setting.layout === '3col'
          ? 'sm:grid-cols-2 lg:grid-cols-3'
          : 'sm:grid-cols-2 xl:grid-cols-3';

  return (
    <div>
      <div className={cn('grid grid-cols-1 items-start gap-3', columns)}>
        {memos.map((memo) => (
          <MemoCard key={memo.uid} memo={memo} compact={setting.layout !== 'list'} />
        ))}
      </div>
      {query.hasNextPage ? (
        <div className="mt-4 flex justify-center">
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

export { FilterChipBar };
