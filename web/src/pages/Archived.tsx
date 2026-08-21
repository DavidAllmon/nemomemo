import { FilterChipBar } from '@/components/filters/FilterChipBar.js';
import { MemoFeed } from '@/components/memo/MemoFeed.js';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';

export function ArchivedPage() {
  const { expression } = useMemoFilters();
  return (
    <div>
      <h1 className="mb-2 font-display text-sm font-bold text-muted-foreground">Treasure chest</h1>
      <FilterChipBar />
      <MemoFeed
        params={{ scope: 'home', state: 'ARCHIVED', filter: expression }}
        emptyTitle="Nothing tucked away"
        emptyHint="Archived memos are kept safe here — even Dory can't forget them."
      />
    </div>
  );
}
