import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  EllipsisVertical,
  Fish,
  Link2,
  ListChecks,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DORY_WINDOWS,
  REMIND_REPEATS,
  setAllTasks,
  type DoryWindow,
  type MemoDto,
  type RemindRepeat,
} from '@nemomemo/shared';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
} from '@/components/ui/overlays.js';
import { useDeleteMemo, useUpdateMemo, useViewer } from '@/hooks/queries.js';
import { ShareDialog } from '@/components/memo/ShareDialog.js';
import { epochToLocalInput, localInputToEpoch } from '@/lib/utils.js';

const DORY_WINDOW_LABELS: Record<DoryWindow, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '3d': '3 days',
  '7d': '7 days',
};

const REPEAT_LABELS: Record<RemindRepeat, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
};

export function MemoActionMenu({ memo, onEdit }: { memo: MemoDto; onEdit?: () => void }) {
  const { data: viewer } = useViewer();
  const update = useUpdateMemo();
  const remove = useDeleteMemo();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [remindInput, setRemindInput] = useState('');
  const [repeatInput, setRepeatInput] = useState<RemindRepeat | ''>('');

  // Creator-or-admin may moderate (archive/delete); only the creator edits —
  // pins, Dory, tasks, and Edit rewrite content or curation, so they're theirs.
  const isOwner = viewer && (viewer.username === memo.creator.username || viewer.role === 'ADMIN');
  const isCreator = viewer?.username === memo.creator.username;
  const isComment = memo.parentUid != null;
  const archived = memo.rowStatus === 'ARCHIVED';

  const copyLink = () => {
    void navigator.clipboard.writeText(`${location.origin}/memos/${memo.uid}`);
  };
  const copyContent = () => {
    void navigator.clipboard.writeText(memo.content);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Memo actions"
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <EllipsisVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isCreator && !archived && !isComment ? (
            <DropdownMenuItem
              onSelect={() => update.mutate({ uid: memo.uid, pinned: !memo.pinned })}
              disabled={memo.forgetAt != null}
            >
              {memo.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {memo.pinned ? 'Unpin' : 'Pin to top'}
            </DropdownMenuItem>
          ) : null}
          {isCreator && !archived && onEdit ? (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
          ) : null}
          {isCreator && !archived && !isComment ? (
            memo.forgetAt != null ? (
              <DropdownMenuItem onSelect={() => update.mutate({ uid: memo.uid, dory: false })}>
                <Fish className="size-4 text-dory" /> Let Dory remember it
              </DropdownMenuItem>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={memo.pinned}>
                  <Fish className="size-4 text-dory" /> Make it a Dory memo
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {DORY_WINDOWS.map((window) => (
                    <DropdownMenuItem
                      key={window}
                      onSelect={() => update.mutate({ uid: memo.uid, dory: true, doryWindow: window })}
                    >
                      Forget after {DORY_WINDOW_LABELS[window]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          ) : null}
          {isCreator && !archived ? (
            <DropdownMenuItem
              onSelect={() => {
                setRemindInput(memo.remindAt != null ? epochToLocalInput(memo.remindAt) : '');
                setRepeatInput(memo.remindEvery ?? '');
                setRemindOpen(true);
              }}
            >
              <AlarmClock className="size-4" />
              {memo.remindAt != null ? 'Change the nudge…' : 'Nudge me about this'}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Copy className="size-4" /> Copy
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 className="size-4" /> Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={copyContent}>
                <Copy className="size-4" /> Copy content
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => { window.location.href = `/api/v1/memos/${memo.uid}/markdown`; }}
              >
                <Download className="size-4" /> Download as .md
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {isCreator && !archived && memo.property.hasTaskList ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ListChecks className="size-4" /> Tasks
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  disabled={!memo.property.hasIncompleteTasks}
                  onSelect={() => update.mutate({ uid: memo.uid, content: setAllTasks(memo.content, true) })}
                >
                  Check all tasks
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => update.mutate({ uid: memo.uid, content: setAllTasks(memo.content, false) })}
                >
                  Uncheck all tasks
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {isOwner && !isComment ? (
            <DropdownMenuItem onSelect={() => setShareOpen(true)}>
              <Share2 className="size-4" /> Share…
            </DropdownMenuItem>
          ) : null}
          {isOwner && !isComment ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  update.mutate({ uid: memo.uid, rowStatus: archived ? 'NORMAL' : 'ARCHIVED' })
                }
              >
                {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {archived ? 'Restore' : memo.forgetAt != null ? 'Archive (save it from Dory)' : 'Archive'}
              </DropdownMenuItem>
            </>
          ) : null}
          {isOwner ? (
            <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title="Move this memo to the trash?"
          description="It waits there for 7 days — comments and attachments go with it — then it's gone for good."
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                remove.mutate(memo.uid, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    // Leave any page that was showing this memo full-screen
                    // (detail page AND share pages).
                    if (location.pathname.startsWith('/memos/')) navigate('/');
                  },
                });
              }}
            >
              Move to trash
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={remindOpen} onOpenChange={setRemindOpen}>
        <DialogContent
          title="Nudge me about this"
          description="Dory taps you on the shoulder at the time you pick — an inbox note, plus an email if your reef sends mail."
        >
          <div className="flex flex-col gap-2">
            <input
              type="datetime-local"
              aria-label="Reminder time"
              value={remindInput}
              min={epochToLocalInput(Math.floor(Date.now() / 1000) + 60)}
              onChange={(event) => setRemindInput(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              aria-label="Repeat"
              value={repeatInput}
              onChange={(event) => setRepeatInput(event.target.value as RemindRepeat | '')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Doesn&apos;t repeat</option>
              {REMIND_REPEATS.map((repeat) => (
                <option key={repeat} value={repeat}>
                  {REPEAT_LABELS[repeat]}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {memo.remindAt != null ? (
              <Button
                variant="outline"
                onClick={() => {
                  update.mutate({ uid: memo.uid, remindAt: null });
                  setRemindOpen(false);
                }}
              >
                Remove nudge
              </Button>
            ) : (
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
            )}
            <Button
              disabled={localInputToEpoch(remindInput) <= Math.floor(Date.now() / 1000)}
              onClick={() => {
                update.mutate({
                  uid: memo.uid,
                  remindAt: localInputToEpoch(remindInput),
                  remindEvery: repeatInput === '' ? null : repeatInput,
                });
                setRemindOpen(false);
              }}
            >
              Set the nudge
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {shareOpen ? <ShareDialog memo={memo} open={shareOpen} onOpenChange={setShareOpen} /> : null}
    </>
  );
}
