import * as Tabs from '@radix-ui/react-tabs';
import { AlarmClock, Archive, Bell, Check, Fish, Hourglass, MessageCircle, AtSign, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { InboxDto } from '@nemomemo/shared';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { Button } from '@/components/ui/button.js';
import { Avatar } from '@/components/ui/misc.js';
import { Tip } from '@/components/ui/overlays.js';
import { useInbox, useInboxAction, useReadAllInbox, useUpdateMemo } from '@/hooks/queries.js';
import { cn, relativeTime } from '@/lib/utils.js';

/** Reef events (no human sender) render Dory-side copy instead of a name. */
const SELF_TYPES: Record<string, { icon: React.ReactNode; text: string }> = {
  REMINDER: { icon: <AlarmClock className="size-4 shrink-0 text-primary" />, text: 'A nudge you asked for 🔔' },
  BOTTLE_ARRIVED: {
    icon: <Hourglass className="size-4 shrink-0 text-ocean" />,
    text: 'A bottle washed ashore — a memo from past you',
  },
  DORY_WARNING: {
    icon: <Fish className="size-4 shrink-0 text-dory" />,
    text: 'Dory is about to forget this memo',
  },
};

type InboxTab = 'UNREAD' | 'READ' | 'ARCHIVED';

const TAB_LABELS: Record<InboxTab, string> = {
  UNREAD: 'Unread',
  READ: 'Read',
  ARCHIVED: 'Archived',
};

const EMPTY_HINTS: Record<InboxTab, { title: string; hint?: string }> = {
  UNREAD: { title: 'All quiet in the reef', hint: 'New comments, mentions, nudges, and bottles will surface here.' },
  READ: { title: 'Nothing read yet', hint: 'Notifications you open drift over here.' },
  ARCHIVED: { title: 'Nothing archived' },
};

export function InboxPage() {
  const [tab, setTab] = useState<InboxTab>('UNREAD');
  const { data, isLoading } = useInbox(tab);
  const action = useInboxAction();
  const readAll = useReadAllInbox();
  const update = useUpdateMemo();

  const rescue = (item: InboxDto) => {
    if (!item.memoUid) return;
    update.mutate({ uid: item.memoUid, dory: false });
    if (item.status === 'UNREAD') action.mutate({ id: item.id, action: 'read' });
  };

  const iconButton = (label: string, icon: React.ReactNode, onClick: () => void, destructive = false) => (
    <Tip label={label}>
      <button
        aria-label={label}
        onClick={onClick}
        className={cn(
          'rounded p-1 text-muted-foreground',
          destructive ? 'hover:text-destructive' : 'hover:text-foreground',
        )}
      >
        {icon}
      </button>
    </Tip>
  );

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

      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as InboxTab)}>
        <Tabs.List className="flex w-72 gap-1 rounded-xl bg-muted p-0.5" aria-label="Inbox status">
          {(['UNREAD', 'READ', 'ARCHIVED'] as const).map((status) => (
            <Tabs.Trigger
              key={status}
              value={status}
              className={cn(
                'flex-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground',
                'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
              )}
            >
              {TAB_LABELS[status]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {isLoading ? (
        <LoadingState />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title={EMPTY_HINTS[tab].title} hint={EMPTY_HINTS[tab].hint} />
      ) : (
        <div className="flex flex-col gap-2">
          {data!.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
              {SELF_TYPES[item.type] ? (
                SELF_TYPES[item.type]!.icon
              ) : item.type === 'MEMO_MENTION' ? (
                <AtSign className="size-4 shrink-0 text-primary" />
              ) : (
                <MessageCircle className="size-4 shrink-0 text-ocean" />
              )}
              {!SELF_TYPES[item.type] && item.sender ? (
                <Avatar name={item.sender.nickname} avatarUrl={item.sender.avatarUrl} className="size-7" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {SELF_TYPES[item.type] ? (
                    SELF_TYPES[item.type]!.text
                  ) : (
                    <>
                      <span className="font-bold">{item.sender?.nickname ?? 'Someone'}</span>{' '}
                      {item.type === 'MEMO_COMMENT'
                        ? 'commented on your memo'
                        : item.type === 'MEMO_THREAD'
                          ? 'replied in a conversation you joined'
                          : 'mentioned you'}
                    </>
                  )}
                </p>
                {item.memoUid ? (
                  <Link
                    to={`/memos/${item.memoUid}`}
                    // Opening a notification is reading it.
                    onClick={() => {
                      if (item.status === 'UNREAD') action.mutate({ id: item.id, action: 'read' });
                    }}
                    className="block truncate text-xs text-muted-foreground hover:underline"
                  >
                    {item.memoSnippet ?? 'View memo'}
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">The memo has since swum away.</p>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">{relativeTime(item.createdTs)}</span>
              {item.type === 'DORY_WARNING' && item.memoUid ? (
                <Button variant="outline" size="sm" onClick={() => rescue(item)}>
                  <Fish className="size-3.5 text-dory" /> Keep it
                </Button>
              ) : null}
              {tab === 'UNREAD'
                ? iconButton('Mark read', <Check className="size-4" />, () => action.mutate({ id: item.id, action: 'read' }))
                : null}
              {tab !== 'ARCHIVED'
                ? iconButton('Archive', <Archive className="size-4" />, () => action.mutate({ id: item.id, action: 'archive' }))
                : null}
              {iconButton('Delete', <Trash2 className="size-4" />, () => action.mutate({ id: item.id, action: 'delete' }), true)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
