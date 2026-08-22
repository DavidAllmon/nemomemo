import * as Tabs from '@radix-ui/react-tabs';
import { Archive, Bell, MessageCircle, AtSign, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { Button } from '@/components/ui/button.js';
import { Avatar } from '@/components/ui/misc.js';
import { useInbox, useInboxAction, useReadAllInbox } from '@/hooks/queries.js';
import { cn, relativeTime } from '@/lib/utils.js';

export function InboxPage() {
  const [tab, setTab] = useState<'UNREAD' | 'ARCHIVED'>('UNREAD');
  const { data, isLoading } = useInbox(tab);
  const action = useInboxAction();
  const readAll = useReadAllInbox();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold">
            <Bell className="size-5 text-ocean" /> Inbox
          </h1>
          <p className="text-sm text-muted-foreground">Comments and mentions from around the reef.</p>
        </div>
        {tab === 'UNREAD' && (data?.items.length ?? 0) > 0 ? (
          <Button variant="outline" size="sm" onClick={() => readAll.mutate()}>
            Mark all read
          </Button>
        ) : null}
      </header>

      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as 'UNREAD' | 'ARCHIVED')}>
        <Tabs.List className="flex w-56 gap-1 rounded-xl bg-muted p-0.5" aria-label="Inbox status">
          {(['UNREAD', 'ARCHIVED'] as const).map((status) => (
            <Tabs.Trigger
              key={status}
              value={status}
              className={cn(
                'flex-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground',
                'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
              )}
            >
              {status === 'UNREAD' ? 'Unread' : 'Archived'}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {isLoading ? (
        <LoadingState />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title={tab === 'UNREAD' ? 'All quiet in the reef' : 'Nothing archived'}
          hint={tab === 'UNREAD' ? 'New comments and mentions will surface here.' : undefined}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data!.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
              {item.type === 'MEMO_MENTION' ? (
                <AtSign className="size-4 shrink-0 text-primary" />
              ) : (
                <MessageCircle className="size-4 shrink-0 text-ocean" />
              )}
              {item.sender ? <Avatar name={item.sender.nickname} avatarUrl={item.sender.avatarUrl} className="size-7" /> : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-bold">{item.sender?.nickname ?? 'Someone'}</span>{' '}
                  {item.type === 'MEMO_COMMENT'
                    ? 'commented on your memo'
                    : item.type === 'MEMO_THREAD'
                      ? 'replied in a conversation you joined'
                      : 'mentioned you'}
                </p>
                {item.memoUid ? (
                  <Link to={`/memos/${item.memoUid}`} className="block truncate text-xs text-muted-foreground hover:underline">
                    {item.memoSnippet ?? 'View memo'}
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">The memo has since swum away.</p>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">{relativeTime(item.createdTs)}</span>
              {tab === 'UNREAD' ? (
                <button
                  aria-label="Archive notification"
                  onClick={() => action.mutate({ id: item.id, action: 'archive' })}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <Archive className="size-4" />
                </button>
              ) : (
                <button
                  aria-label="Delete notification"
                  onClick={() => action.mutate({ id: item.id, action: 'delete' })}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
