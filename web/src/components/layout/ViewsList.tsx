import { Filter, ListChecks, Plus } from 'lucide-react';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useUserSettings, useViewer } from '@/hooks/queries.js';
import { cn } from '@/lib/utils.js';

export const BUILT_IN_TASKS_VIEW = {
  id: '__tasks__',
  title: 'Open tasks',
  filter: 'has_task_list && has_incomplete_tasks',
};

export function ViewsList() {
  const { data: viewer } = useViewer();
  const { data: settings } = useUserSettings(!!viewer);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get('view');

  if (!viewer) return null;
  const views = settings?.memoViews ?? [];

  return (
    <section aria-label="Views">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Views</span>
        <NavLink
          to="/views"
          aria-label="Manage views"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <Plus className="size-3.5" />
        </NavLink>
      </div>
      <div className="flex flex-col gap-0.5">
        <NavLink
          to="/tasks"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] hover:bg-accent',
              isActive && 'bg-accent font-semibold',
            )
          }
        >
          <ListChecks className="size-3.5 text-ocean" />
          <span className="truncate">{BUILT_IN_TASKS_VIEW.title}</span>
        </NavLink>
        {views.map((view) => (
          <button
            key={view.id}
            aria-pressed={activeView === view.id}
            onClick={() => navigate(activeView === view.id ? '/' : `/?view=${view.id}`)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] hover:bg-accent',
              activeView === view.id && 'bg-accent font-semibold',
            )}
          >
            <Filter className="size-3.5 text-ocean" />
            <span className="truncate">{view.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
