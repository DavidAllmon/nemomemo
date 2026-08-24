import { Archive, ArchiveRestore, CheckSquare, Settings2, Tag, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { MemoDto } from '@nemomemo/shared';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { FilterChipBar } from '@/components/filters/FilterChipBar.js';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/misc.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/overlays.js';
import { useViewSetting, type ViewSetting } from '@/context/view-setting.js';
import { useBulkMemoAction, useMemoList, type MemoListParams } from '@/hooks/queries.js';
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

/** Sticky bar with the actions for the current selection. */
function BulkActionBar({
  count,
  archived,
  onAction,
  pending,
  onCancel,
}: {
  count: number;
  archived: boolean;
  onAction: (action: 'archive' | 'unarchive' | 'trash' | 'tag', tag?: string) => void;
  pending: boolean;
  onCancel: () => void;
}) {
  const [tagOpen, setTagOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);
  const none = count === 0;

  const submitTag = () => {
    const tag = tagInput.trim().replace(/^#/, '');
    if (!tag) return;
    setTagOpen(false);
    setTagInput('');
    onAction('tag', tag);
  };

  return (
    <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-popover p-2 shadow-lg">
      <span className="px-2 text-sm font-semibold tabular-nums">
        {count} selected
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={none || pending}
        onClick={() => onAction(archived ? 'unarchive' : 'archive')}
      >
        {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        {archived ? 'Unarchive' : 'Archive'}
      </Button>
      <Button size="sm" variant="outline" disabled={none || pending} onClick={() => setTagOpen(true)}>
        <Tag className="size-4" /> Add tag…
      </Button>
      <Button size="sm" variant="destructive" disabled={none || pending} onClick={() => setTrashOpen(true)}>
        <Trash2 className="size-4" /> Move to trash
      </Button>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
        <X className="size-4" /> Cancel
      </Button>

      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent
          title={`Tag ${count} memo(s)`}
          description="The tag is added at the end of each memo — ones that already carry it are left alone, and every rewritten memo keeps its old words in History."
        >
          <Input
            autoFocus
            placeholder="reef/notes"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitTag();
            }}
          />
          <div className="mt-3 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={!tagInput.trim()} onClick={submitTag}>
              Add the tag
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent
          title={`Move ${count} memo(s) to the trash?`}
          description="They wait there for 7 days — comments and attachments go with them — then they're gone for good."
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setTrashOpen(false);
                onAction('trash');
              }}
            >
              Move to trash
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MemoFeed({
  params,
  emptyTitle,
  emptyHint,
  selectable,
}: {
  params: Omit<MemoListParams, 'orderBy' | 'dir'>;
  emptyTitle: string;
  emptyHint?: string;
  /** Offer multi-select bulk actions — only for feeds of the viewer's own memos. */
  selectable?: boolean;
}) {
  const { setting } = useViewSetting();
  const query = useMemoList({ ...params, orderBy: setting.orderBy, dir: setting.direction });
  const bulk = useBulkMemoAction();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const runBulk = (action: 'archive' | 'unarchive' | 'trash' | 'tag', tag?: string) => {
    bulk.mutate({ uids: [...selected], action, tag }, { onSuccess: exitSelection });
  };

  return (
    <div>
      {selectable ? (
        <div className="mb-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={selecting}
            onClick={() => (selecting ? exitSelection() : setSelecting(true))}
          >
            <CheckSquare className="size-4" /> {selecting ? 'Done' : 'Select'}
          </Button>
        </div>
      ) : null}
      <div className={cn('grid grid-cols-1 items-start gap-3', columns)}>
        {memos.map((memo) =>
          selecting ? (
            <div
              key={memo.uid}
              role="checkbox"
              aria-checked={selected.has(memo.uid)}
              aria-label={`Select memo from ${memo.creator.username}`}
              tabIndex={0}
              onClickCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggle(memo.uid);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(memo.uid);
                }
              }}
              className={cn(
                'cursor-pointer rounded-2xl transition-shadow',
                selected.has(memo.uid) && 'ring-2 ring-ocean',
              )}
            >
              <MemoCard memo={memo} compact={setting.layout !== 'list'} />
            </div>
          ) : (
            <MemoCard key={memo.uid} memo={memo} compact={setting.layout !== 'list'} />
          ),
        )}
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
      {selecting ? (
        <BulkActionBar
          count={selected.size}
          archived={params.state === 'ARCHIVED'}
          onAction={runBulk}
          pending={bulk.isPending}
          onCancel={exitSelection}
        />
      ) : null}
    </div>
  );
}

export { FilterChipBar };
