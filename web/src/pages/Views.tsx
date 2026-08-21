import { validateFilter, type MemoViewDto } from '@nemomemo/shared';
import { Filter, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/misc.js';
import { useUpdateUserSettings, useUserSettings } from '@/hooks/queries.js';

const EXAMPLES: { title: string; filter: string }[] = [
  { title: 'Pinned', filter: 'pinned' },
  { title: 'Fresh today', filter: 'created_ts >= now - duration("24h")' },
  { title: 'Public memos', filter: 'visibility == "PUBLIC"' },
  { title: 'Work tags', filter: 'tag in ["work", "projects"]' },
  { title: 'Open tasks', filter: 'has_task_list && has_incomplete_tasks' },
  { title: 'Links or code', filter: 'has_link || has_code' },
  { title: 'Mentions of TODO', filter: 'content.contains("TODO")' },
];

export function ViewsPage() {
  const { data: settings } = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const [editing, setEditing] = useState<MemoViewDto | null>(null);
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const views = settings?.memoViews ?? [];

  const startEdit = (view: MemoViewDto | null) => {
    setEditing(view);
    setTitle(view?.title ?? '');
    setFilter(view?.filter ?? '');
    setFeedback(null);
  };

  const validate = () => {
    const error = validateFilter(filter);
    setFeedback(
      error ? { ok: false, message: error } : { ok: true, message: 'Filter looks valid — nice catch!' },
    );
    return !error;
  };

  const save = () => {
    if (!title.trim() || !filter.trim()) {
      setFeedback({ ok: false, message: 'Title and filter are both required.' });
      return;
    }
    if (!validate()) return;
    const next = editing
      ? views.map((view) => (view.id === editing.id ? { ...view, title, filter } : view))
      : [...views, { id: `view-${Date.now()}`, title: title.trim(), filter: filter.trim() }];
    updateSettings.mutate(
      { memoViews: next },
      {
        onSuccess: () => {
          startEdit(null);
          setTitle('');
          setFilter('');
        },
      },
    );
  };

  const remove = (view: MemoViewDto) => {
    updateSettings.mutate({ memoViews: views.filter((candidate) => candidate.id !== view.id) });
  };

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <Filter className="size-5 text-ocean" /> Views
        </h1>
        <p className="text-sm text-muted-foreground">
          Saved filters that live in your sidebar. Validate before saving, then click one to swim
          straight to it.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold">
          {editing ? `Edit “${editing.title}”` : 'Create a view'}
        </h2>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="view-title">
            Title
          </label>
          <Input
            id="view-title"
            placeholder="🪸 Reef projects"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="view-filter">
            Filter expression
          </label>
          <Input
            id="view-filter"
            placeholder='tag in ["work"] && has_incomplete_tasks'
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setFeedback(null);
            }}
            className="font-mono text-xs"
          />
          {feedback ? (
            <p className={`text-xs font-semibold ${feedback.ok ? 'text-ocean' : 'text-destructive'}`}>
              {feedback.message}
            </p>
          ) : null}
          <div className="mt-1 flex gap-2">
            <Button variant="outline" size="sm" onClick={validate} disabled={!filter.trim()}>
              Validate
            </Button>
            <Button size="sm" onClick={save} disabled={updateSettings.isPending}>
              {editing ? 'Save changes' : 'Create view'}
            </Button>
            {editing ? (
              <Button variant="ghost" size="sm" onClick={() => startEdit(null)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {views.length > 0 ? (
        <section className="flex flex-col gap-2">
          {views.map((view) => (
            <div
              key={view.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{view.title}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{view.filter}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Edit ${view.title}`} onClick={() => startEdit(view)}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Delete ${view.title}`} onClick={() => remove(view)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Example expressions
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.title}
              onClick={() => {
                setTitle(example.title);
                setFilter(example.filter);
                setFeedback(null);
              }}
              className="rounded-xl border border-border bg-card px-3 py-2 text-left hover:bg-accent"
            >
              <p className="text-sm font-semibold">{example.title}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{example.filter}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
