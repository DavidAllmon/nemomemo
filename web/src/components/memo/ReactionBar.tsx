import { SmilePlus } from 'lucide-react';
import type { MemoDto } from '@nemomemo/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays.js';
import { useInstanceMemoSetting, useToggleReaction, useViewer } from '@/hooks/queries.js';
import { cn } from '@/lib/utils.js';

export function ReactionBar({ memo }: { memo: MemoDto }) {
  const { data: viewer } = useViewer();
  const { data: setting } = useInstanceMemoSetting();
  const toggle = useToggleReaction();

  if (memo.reactions.length === 0 && !viewer) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {memo.reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          disabled={!viewer || toggle.isPending}
          onClick={() =>
            toggle.mutate({ uid: memo.uid, emoji: reaction.emoji, active: reaction.reactedByViewer })
          }
          className={cn(
            'flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold',
            reaction.reactedByViewer
              ? 'border-primary/50 bg-primary/10'
              : 'border-border hover:bg-accent',
            !viewer && 'pointer-events-none opacity-70',
          )}
        >
          <span>{reaction.emoji}</span>
          <span className="tabular-nums">{reaction.count}</span>
        </button>
      ))}
      {viewer ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              aria-label="Add reaction"
              className="flex h-7 items-center rounded-full border border-dashed border-border px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <SmilePlus className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2">
            <div className="flex flex-wrap gap-1">
              {(setting?.reactions ?? []).map((emoji) => {
                const active = memo.reactions.some((r) => r.emoji === emoji && r.reactedByViewer);
                return (
                  <button
                    key={emoji}
                    onClick={() => toggle.mutate({ uid: memo.uid, emoji, active })}
                    className={cn(
                      'rounded-lg p-1.5 text-lg hover:bg-accent',
                      active && 'bg-primary/10',
                    )}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
