import { ArchiveRestore } from 'lucide-react';
import { useState } from 'react';
import type { MemoDto } from '@nemomemo/shared';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent } from '@/components/ui/overlays.js';
import { useMemoHistory, useRestoreRevision } from '@/hooks/queries.js';
import { diffLines } from '@/lib/diff.js';
import { absoluteTime } from '@/lib/utils.js';

const LINE_STYLES = {
  same: 'text-foreground',
  added: 'bg-ocean-soft text-ocean',
  removed: 'bg-destructive/10 text-destructive line-through decoration-destructive/40',
} as const;

export function MemoHistoryDialog({
  memo,
  open,
  onOpenChange,
}: {
  memo: MemoDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useMemoHistory(memo.uid, open);
  const restore = useRestoreRevision(memo.uid);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const revisions = data?.revisions ?? [];
  const selected = revisions.find((revision) => revision.id === selectedId) ?? revisions[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Edit history"
        description="Every save keeps the words it replaced — the last 20 edits, for 90 days."
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Fishing old versions out of the current…</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No past versions yet. Edit this memo and the old words will wait here — just keep
            swimming.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {revisions.map((revision) => (
                <button
                  key={revision.id}
                  onClick={() => setSelectedId(revision.id)}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    revision.id === selected?.id
                      ? 'border-ocean bg-ocean-soft text-ocean'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {absoluteTime(revision.createdTs)}
                </button>
              ))}
            </div>

            {selected ? (
              <>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-3">
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                    {diffLines(memo.content, selected.content).map((line, index) => (
                      <div key={index} className={`rounded px-1 ${LINE_STYLES[line.kind]}`}>
                        {line.text === '' ? ' ' : line.text}
                      </div>
                    ))}
                  </pre>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Highlighted lines come back if you restore; struck-through lines go. Restoring
                    keeps today&apos;s version in the history too — nothing is lost.
                  </p>
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={restore.isPending || selected.content === memo.content}
                    onClick={() =>
                      restore.mutate(selected.id, { onSuccess: () => onOpenChange(false) })
                    }
                  >
                    <ArchiveRestore className="size-4" /> Restore this version
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
