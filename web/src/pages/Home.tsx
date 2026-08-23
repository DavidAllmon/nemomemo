import { useSearchParams } from 'react-router-dom';
import { FilterChipBar } from '@/components/filters/FilterChipBar.js';
import { LazyMemoEditor } from '@/components/editor/lazy.js';
import { MemoFeed, ViewOptionsButton } from '@/components/memo/MemoFeed.js';
import { BUILT_IN_TASKS_VIEW } from '@/components/layout/ViewsList.js';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';
import { useUserSettings, useViewer } from '@/hooks/queries.js';

export function HomePage() {
  const { data: viewer } = useViewer();
  const { data: settings } = useUserSettings(!!viewer);
  const { expression } = useMemoFilters();
  const [searchParams] = useSearchParams();

  const viewId = searchParams.get('view');
  const view =
    viewId === BUILT_IN_TASKS_VIEW.id
      ? BUILT_IN_TASKS_VIEW
      : (settings?.memoViews ?? []).find((candidate) => candidate.id === viewId);

  const combined = [expression, view?.filter]
    .filter(Boolean)
    .map((clause) => `(${clause})`)
    .join(' && ');

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <LazyMemoEditor />
      </div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-display text-sm font-bold text-muted-foreground">
          {view ? `View: ${view.title}` : 'Your reef'}
        </h1>
        <ViewOptionsButton />
      </div>
      <FilterChipBar />
      <MemoFeed
        params={{ scope: 'home', filter: combined || undefined }}
        emptyTitle="No memos yet"
        emptyHint="Just keep swimming — write your first thought above. 🫧"
      />
    </div>
  );
}
