import * as Tabs from '@radix-ui/react-tabs';
import { Paperclip, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { Button } from '@/components/ui/button.js';
import { Badge } from '@/components/ui/misc.js';
import {
  useAttachments,
  useDeleteAttachment,
  useDeleteUnusedAttachments,
  useTags,
} from '@/hooks/queries.js';
import { fileUrl } from '@/lib/api.js';
import { cn, formatBytes, relativeTime } from '@/lib/utils.js';

const TABS = [
  { value: '', label: 'All' },
  { value: 'media', label: 'Media' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' },
];

export function AttachmentsPage() {
  const [tab, setTab] = useState('');
  const [tag, setTag] = useState('');
  const { data, isLoading } = useAttachments({ type: tab || undefined, tag: tag || undefined });
  const { data: tagCounts } = useTags();
  const deleteAttachment = useDeleteAttachment();
  const deleteUnused = useDeleteUnusedAttachments();

  const attachments = data?.attachments ?? [];
  const unusedCount = attachments.filter((a) => a.memoUid == null).length;
  const tagOptions = Object.keys(tagCounts ?? {}).sort();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold">
            <Paperclip className="size-5 text-ocean" /> Attachments
          </h1>
          <p className="text-sm text-muted-foreground">Every file you've dropped into the reef.</p>
        </div>
        {unusedCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(`Delete ${unusedCount} unused upload(s)? This can't be undone.`)) {
                deleteUnused.mutate();
              }
            }}
          >
            Delete {unusedCount} unused
          </Button>
        ) : null}
      </header>

      <div className="flex items-center gap-2">
        <Tabs.Root value={tab} onValueChange={setTab} className="flex-1">
          <Tabs.List className="flex gap-1 rounded-xl bg-muted p-0.5" aria-label="Attachment types">
            {TABS.map((entry) => (
              <Tabs.Trigger
                key={entry.value}
                value={entry.value}
                className={cn(
                  'flex-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground',
                  'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
                )}
              >
                {entry.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
        {tagOptions.length > 0 ? (
          <select
            aria-label="Filter by tag"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            className="rounded-xl border border-border bg-card px-2 py-1 text-xs font-semibold text-muted-foreground"
          >
            <option value="">All tags</option>
            {tagOptions.map((option) => (
              <option key={option} value={option}>
                #{option}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : attachments.length === 0 ? (
        tag ? (
          <EmptyState
            title={`Nothing under #${tag}`}
            hint="No attachments swim with that tag — try another, or clear the filter."
          />
        ) : (
          <EmptyState title="No attachments yet" hint="Drop a file into the memo editor to start." />
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {attachments.map((attachment) => (
            <div key={attachment.uid} className="overflow-hidden rounded-xl border border-border bg-card">
              {attachment.type.startsWith('image/') ? (
                <img
                  src={fileUrl(attachment.uid, attachment.filename, { thumbnail: true })}
                  alt={attachment.filename}
                  loading="lazy"
                  className="h-28 w-full object-cover"
                />
              ) : (
                <div className="flex h-28 items-center justify-center bg-muted text-muted-foreground">
                  <Paperclip className="size-8" />
                </div>
              )}
              <div className="flex flex-col gap-1 p-2">
                <p className="truncate text-xs font-semibold">{attachment.filename}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatBytes(attachment.size)} · {relativeTime(attachment.createdTs)}
                </p>
                <div className="flex items-center gap-1">
                  {attachment.memoUid ? (
                    <Link to={`/memos/${attachment.memoUid}`}>
                      <Badge className="hover:bg-accent">Memo</Badge>
                    </Link>
                  ) : (
                    <Badge className="border-dashed">Not linked</Badge>
                  )}
                  <button
                    aria-label={`Delete ${attachment.filename}`}
                    className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteAttachment.mutate(attachment.uid)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
