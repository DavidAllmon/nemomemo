import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/overlays.js';
import { useDeleteMemo, useEmptyTrash, useRestoreMemo, useTrash, useViewer } from '@/hooks/queries.js';
import { forgetCountdown } from '@/lib/utils.js';

export function TrashPage() {
  const { data: viewer } = useViewer();
  const { data, isLoading } = useTrash(!!viewer);
  const restore = useRestoreMemo();
  const remove = useDeleteMemo();
  const empty = useEmptyTrash();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);

  const memos = data?.memos ?? [];
  const days = Math.round((data?.retentionSeconds ?? 7 * 86_400) / 86_400);

  return (
    <div>
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold">Trash</h1>
          <p className="text-sm text-muted-foreground">
            Deleted memos wait here for {days} days, then Dory really does forget them.
          </p>
        </div>
        {memos.length > 0 ? (
          <Button variant="outline" onClick={() => setConfirmEmpty(true)}>
            Empty the trash
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : memos.length === 0 ? (
        <EmptyState
          title="The trash is empty"
          hint="Nothing waiting to be forgotten. Just keep swimming. 🫧"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {memos.map((memo) => (
            <div key={memo.uid} className="flex flex-col gap-1.5">
              <MemoCard memo={memo} compact readOnly />
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs text-muted-foreground">
                  {memo.deletedAt != null
                    ? `Gone in ${forgetCountdown(memo.deletedAt + data!.retentionSeconds)}`
                    : 'Gone soon'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(memo.uid)}
                >
                  <RotateCcw className="size-3.5" /> Restore
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmPurge(memo.uid)}>
                  <Trash2 className="size-3.5" /> Delete forever
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <DialogContent
          title="Empty the trash?"
          description="Every memo in here goes for good, right now — comments and attachments with them. There's no getting them back."
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={empty.isPending}
              onClick={() => empty.mutate(undefined, { onSuccess: () => setConfirmEmpty(false) })}
            >
              Empty it
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmPurge != null} onOpenChange={(open) => !open && setConfirmPurge(null)}>
        <DialogContent
          title="Delete this memo forever?"
          description="This one skips the rest of its week in the trash. Comments and attachments go with it, and there's no getting it back."
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!confirmPurge) return;
                remove.mutate(
                  { uid: confirmPurge, permanent: true },
                  { onSuccess: () => setConfirmPurge(null) },
                );
              }}
            >
              Delete forever
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
