import { Earth, Link2, Lock, MessageCircle, Paperclip, Pin, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MemoDto } from '@nemomemo/shared';
import { DoryBadge } from '@/components/memo/DoryBadge.js';
import { MemoActionMenu } from '@/components/memo/MemoActionMenu.js';
import { MemoContent } from '@/components/memo/MemoContent.js';
import { MemoEditor } from '@/components/editor/MemoEditor.js';
import { ReactionBar } from '@/components/memo/ReactionBar.js';
import { Avatar } from '@/components/ui/misc.js';
import { Tip } from '@/components/ui/overlays.js';
import { useUpdateMemo, useViewer } from '@/hooks/queries.js';
import { fileUrl } from '@/lib/api.js';
import { absoluteTime, cn, doryOpacity, formatBytes, relativeTime } from '@/lib/utils.js';

const VISIBILITY_META = {
  PRIVATE: { icon: Lock, label: 'Private — only you' },
  PROTECTED: { icon: Users, label: 'Protected — signed-in users' },
  PUBLIC: { icon: Earth, label: 'Public — everyone' },
} as const;

function AttachmentPanel({ memo, shareToken }: { memo: MemoDto; shareToken?: string }) {
  const [lightbox, setLightbox] = useState<{ uid: string; filename: string } | null>(null);
  if (memo.attachments.length === 0) return null;
  const images = memo.attachments.filter((a) => a.type.startsWith('image/'));
  const files = memo.attachments.filter((a) => !a.type.startsWith('image/'));
  return (
    <div className="rounded-xl border border-border p-2.5">
      <p className="mb-2 flex items-center gap-1 text-xs font-bold text-muted-foreground">
        <Paperclip className="size-3.5" /> Attachments ({memo.attachments.length})
      </p>
      {images.length > 0 ? (
        <div className={cn('grid gap-2', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {images.map((attachment) => (
            <button
              key={attachment.uid}
              onClick={() => setLightbox(attachment)}
              className="overflow-hidden rounded-lg"
            >
              <img
                src={fileUrl(attachment.uid, attachment.filename, { thumbnail: true, share: shareToken })}
                alt={attachment.filename}
                loading="lazy"
                className="max-h-64 w-full object-cover transition-transform hover:scale-[1.02]"
              />
            </button>
          ))}
        </div>
      ) : null}
      {files.map((attachment) => (
        <a
          key={attachment.uid}
          href={fileUrl(attachment.uid, attachment.filename, { share: shareToken })}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-accent"
        >
          <Paperclip className="size-3.5 text-muted-foreground" />
          <span className="truncate">{attachment.filename}</span>
          <span className="ml-auto text-xs text-muted-foreground">{formatBytes(attachment.size)}</span>
        </a>
      ))}
      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-6"
          role="dialog"
          aria-label={lightbox.filename}
          onClick={() => setLightbox(null)}
        >
          <img
            src={fileUrl(lightbox.uid, lightbox.filename, { share: shareToken })}
            alt={lightbox.filename}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
          <p className="absolute left-4 top-3 text-sm font-semibold text-background">{lightbox.filename}</p>
        </div>
      ) : null}
    </div>
  );
}

function RelationPanel({ memo }: { memo: MemoDto }) {
  if (memo.referencing.length === 0 && memo.referencedBy.length === 0) return null;
  const section = (title: string, stubs: MemoDto['referencing']) =>
    stubs.length > 0 ? (
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <Link2 className="size-3.5" /> {title} ({stubs.length})
        </p>
        {stubs.map((stub) => (
          <Link
            key={stub.uid}
            to={`/memos/${stub.uid}`}
            className="block truncate rounded-lg px-2 py-1 text-sm hover:bg-accent"
          >
            <span className="font-semibold">@{stub.creator}</span>{' '}
            <span className="text-muted-foreground">{stub.snippet}</span>
          </Link>
        ))}
      </div>
    ) : null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-2.5">
      {section('Referencing', memo.referencing)}
      {section('Referenced by', memo.referencedBy)}
    </div>
  );
}

export function MemoCard({
  memo,
  showCommentsLink = true,
  shareToken,
  compact,
}: {
  memo: MemoDto;
  showCommentsLink?: boolean;
  shareToken?: string;
  compact?: boolean;
}) {
  const { data: viewer } = useViewer();
  const update = useUpdateMemo();
  const [editing, setEditing] = useState(false);
  const isOwner = viewer && (viewer.username === memo.creator.username || viewer.role === 'ADMIN');
  const Visibility = VISIBILITY_META[memo.visibility].icon;

  if (editing) {
    return (
      <article className="rounded-2xl border border-border bg-card p-4">
        <MemoEditor memo={memo} onDone={() => setEditing(false)} />
      </article>
    );
  }

  return (
    <article
      className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 transition-opacity"
      style={{ opacity: doryOpacity(memo.forgetAt) }}
    >
      <header className="flex items-center gap-2.5">
        <Link to={`/u/${memo.creator.username}`}>
          <Avatar name={memo.creator.nickname} avatarUrl={memo.creator.avatarUrl} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <Link to={`/u/${memo.creator.username}`} className="text-sm font-bold hover:underline">
            {memo.creator.nickname}
          </Link>
          <Tip label={`Written ${absoluteTime(memo.createdTs)}`}>
            <Link to={`/memos/${memo.uid}`} className="block text-xs text-muted-foreground hover:underline">
              {relativeTime(memo.createdTs)}
              {memo.rowStatus === 'ARCHIVED' ? ' · archived' : ''}
            </Link>
          </Tip>
        </div>
        {memo.forgetAt != null ? <DoryBadge forgetAt={memo.forgetAt} /> : null}
        {memo.pinned ? <Pin className="size-3.5 text-primary" aria-label="Pinned" /> : null}
        <Tip label={VISIBILITY_META[memo.visibility].label}>
          <Visibility className="size-3.5 text-muted-foreground" />
        </Tip>
        {viewer || shareToken == null ? (
          <MemoActionMenu memo={memo} onEdit={isOwner ? () => setEditing(true) : undefined} />
        ) : null}
      </header>

      <MemoContent
        content={memo.content}
        className={cn(compact && 'max-h-64 overflow-hidden')}
        onContentChange={
          isOwner && memo.rowStatus === 'NORMAL'
            ? (next) => update.mutate({ uid: memo.uid, content: next })
            : undefined
        }
      />

      <AttachmentPanel memo={memo} shareToken={shareToken} />
      <RelationPanel memo={memo} />

      <footer className="flex items-center gap-2">
        <ReactionBar memo={memo} />
        {showCommentsLink ? (
          <Link
            to={`/memos/${memo.uid}#comments`}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <MessageCircle className="size-3.5" />
            {memo.commentCount > 0
              ? `${memo.commentCount} ${memo.commentCount === 1 ? 'comment' : 'comments'}`
              : 'Comment'}
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
