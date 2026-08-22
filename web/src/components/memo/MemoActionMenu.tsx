import {
  Archive,
  ArchiveRestore,
  Copy,
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
import { setAllTasks, type MemoDto } from '@nemomemo/shared';
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

export function MemoActionMenu({ memo, onEdit }: { memo: MemoDto; onEdit?: () => void }) {
  const { data: viewer } = useViewer();
  const update = useUpdateMemo();
  const remove = useDeleteMemo();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const isOwner = viewer && (viewer.username === memo.creator.username || viewer.role === 'ADMIN');
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
          {isOwner && !archived && !isComment ? (
            <DropdownMenuItem
              onSelect={() => update.mutate({ uid: memo.uid, pinned: !memo.pinned })}
              disabled={memo.forgetAt != null}
            >
              {memo.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {memo.pinned ? 'Unpin' : 'Pin to top'}
            </DropdownMenuItem>
          ) : null}
          {isOwner && !archived && onEdit ? (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
          ) : null}
          {isOwner && !archived && !isComment ? (
            <DropdownMenuItem
              onSelect={() => update.mutate({ uid: memo.uid, dory: memo.forgetAt == null })}
              disabled={memo.pinned}
            >
              <Fish className="size-4 text-dory" />
              {memo.forgetAt != null ? 'Let Dory remember it' : 'Make it a Dory memo'}
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
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {isOwner && !archived && memo.property.hasTaskList ? (
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
          title="Delete this memo?"
          description="This can't be undone — attachments, comments, and links go with it."
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
              Delete memo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {shareOpen ? <ShareDialog memo={memo} open={shareOpen} onOpenChange={setShareOpen} /> : null}
    </>
  );
}
