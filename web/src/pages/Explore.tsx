import { FilterChipBar } from '@/components/filters/FilterChipBar.js';
import { MemoFeed, ViewOptionsButton } from '@/components/memo/MemoFeed.js';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';

export function ExplorePage() {
  const { expression } = useMemoFilters();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-display text-sm font-bold text-muted-foreground">The open ocean</h1>
        <ViewOptionsButton />
      </div>
      <FilterChipBar />
      <MemoFeed
        params={{ scope: 'explore', filter: expression }}
        emptyTitle="The ocean is quiet"
        emptyHint="Shared memos from everyone on this reef will show up here."
      />
    </div>
  );
}
