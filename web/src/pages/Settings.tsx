import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Settings as SettingsIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { TAG_COLOR_NAMES, type TagColor, type Visibility } from '@nemomemo/shared';
import { Button } from '@/components/ui/button.js';
import { Avatar, Input } from '@/components/ui/misc.js';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/overlays.js';
import { SWATCH_CLASSES, tagGlyphClass } from '@/lib/tag-colors.js';
import { fileToAvatarDataUrl } from '@/lib/avatar.js';
import { useTheme, type Theme } from '@/context/theme.js';
import {
  keys,
  useCloudBilling,
  useCloudSnapshots,
  useInstanceProfile,
  useInstanceSettings,
  useMembers,
  useRenameTag,
  useTags,
  useUpdateUserSettings,
  useUserSettings,
  useViewer,
  type CloudBillingInfo,
} from '@/hooks/queries.js';
import { api, ApiError, apiUpload } from '@/lib/api.js';
import { cn } from '@/lib/utils.js';

type Section = 'account' | 'preferences' | 'tags' | 'members' | 'instance' | 'backups' | 'billing';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 font-display text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

function useStatus() {
  const [status, setStatus] = useState<string | null>(null);
  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2500);
  };
  return { status, flash };
}

function AccountSection() {
  const { data: viewer } = useViewer();
  const { data: profile } = useInstanceProfile();
  const queryClient = useQueryClient();
  const { status, flash } = useStatus();
  const [nickname, setNickname] = useState(viewer?.nickname ?? '');
  const [email, setEmail] = useState(viewer?.email ?? '');
  const [description, setDescription] = useState(viewer?.description ?? '');
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(viewer?.avatarUrl ?? '');

  const pickAvatar = async (file: File) => {
    try {
      setAvatarUrl(await fileToAvatarDataUrl(file));
    } catch (error) {
      flash(error instanceof Error ? error.message : 'That image did not want to shrink');
    }
  };

  const save = async () => {
    try {
      await api('PATCH', '/api/v1/users/-/account', {
        nickname,
        email,
        description,
        avatarUrl,
        ...(password ? { password } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: keys.viewer });
      setPassword('');
      flash('Saved!');
    } catch (error) {
      flash(error instanceof ApiError ? error.message : 'Could not save');
    }
  };

  return (
    <SectionCard title="My account">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-muted-foreground">Avatar</label>
        <div className="flex items-center gap-3">
          <Avatar name={nickname || viewer?.username || '?'} avatarUrl={avatarUrl} className="size-14 text-xl" />
          <label className="cursor-pointer">
            <span className="inline-flex h-8 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-accent">
              Choose image…
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void pickAvatar(file);
                event.target.value = '';
              }}
            />
          </label>
          {avatarUrl ? (
            <Button variant="ghost" size="sm" onClick={() => setAvatarUrl('')}>
              Remove
            </Button>
          ) : null}
        </div>
        <label className="text-xs font-semibold text-muted-foreground">Nickname</label>
        <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <label className="text-xs font-semibold text-muted-foreground">Email</label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {viewer?.email && email === viewer.email ? (
          viewer.emailVerified ? (
            <p className="text-xs font-semibold text-ocean">Verified ✓</p>
          ) : profile?.emailEnabled ? (
            <p className="text-xs text-muted-foreground">
              Not verified yet —{' '}
              <button
                className="font-semibold text-ocean hover:underline"
                onClick={() =>
                  void api('POST', '/api/v1/auth/verify/resend', {})
                    .then(() => flash('Verification email sent!'))
                    .catch((e) => flash(e instanceof ApiError ? e.message : 'Could not send'))
                }
              >
                resend the link
              </button>
            </p>
          ) : null
        ) : null}
        <label className="text-xs font-semibold text-muted-foreground">About you</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="text-xs font-semibold text-muted-foreground">New password (leave blank to keep, 8+ characters)</label>
        <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" onClick={() => void save()}>
            Save changes
          </Button>
          {status ? <span className="text-xs font-semibold text-ocean">{status}</span> : null}
        </div>
      </div>
    </SectionCard>
  );
}

function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const { data: settings } = useUserSettings();
  const updateSettings = useUpdateUserSettings();

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Appearance">
        <div className="flex gap-2">
          {(['system', 'shallows', 'deep-sea'] as Theme[]).map((option) => (
            <button
              key={option}
              onClick={() => setTheme(option)}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold',
                theme === option ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
              )}
            >
              {option === 'system' ? 'Match the tide' : option === 'shallows' ? 'Shallows ☀️' : 'Deep Sea 🌙'}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Memo defaults">
        <label className="text-xs font-semibold text-muted-foreground">Default visibility for new memos</label>
        <select
          value={settings?.general.defaultVisibility ?? 'PRIVATE'}
          onChange={(event) =>
            updateSettings.mutate({ general: { defaultVisibility: event.target.value as Visibility } })
          }
          className="mt-1 h-9 w-56 rounded-xl border border-input bg-card px-2 text-sm"
        >
          <option value="PRIVATE">Private — only you</option>
          <option value="PROTECTED">Protected — signed-in users</option>
          <option value="PUBLIC">Public — everyone</option>
        </select>
      </SectionCard>

    </div>
  );
}

function TagsSection() {
  const { data: tags } = useTags(true);
  const { data: settings } = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const renameTag = useRenameTag();
  const { status, flash } = useStatus();
  const [editing, setEditing] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [merge, setMerge] = useState<{ from: string; to: string } | null>(null);

  const entries = Object.entries(tags ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const tagColors = settings?.general.tagColors ?? {};

  const setColor = (tag: string, color: TagColor) => {
    const next = { ...tagColors };
    // `ocean` is the default coat — picking it just clears the entry.
    if (color === 'ocean') delete next[tag];
    else next[tag] = color;
    updateSettings.mutate({ general: { tagColors: next } });
  };

  const doRename = (from: string, to: string) => {
    renameTag.mutate(
      { from, to },
      {
        onSuccess: ({ changed }) => {
          flash(`Now #${to} in ${changed} memo(s)`);
          setEditing(null);
          setRenameTo('');
          setMerge(null);
        },
        onError: (error) => {
          setMerge(null);
          flash(error instanceof ApiError ? error.message : 'Could not rename');
        },
      },
    );
  };

  const submitRename = (from: string) => {
    const to = renameTo.trim().replace(/^#/, '');
    if (!to || to === from) return;
    if (tags && to in tags) setMerge({ from, to });
    else doRename(from, to);
  };

  return (
    <SectionCard title="Your tags">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tags yet — write <code className="font-mono">#something</code> in a memo and it&apos;ll
          swim up here.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map(([name, count]) => (
            <div key={name} className="flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent/50">
              <span className={cn('min-w-0 truncate text-sm font-semibold', tagGlyphClass(tagColors[name]))}>
                #{name}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
              <span className="ml-auto flex items-center gap-1">
                {TAG_COLOR_NAMES.map((color) => (
                  <button
                    key={color}
                    aria-label={`Paint #${name} ${color}`}
                    aria-pressed={(tagColors[name] ?? 'ocean') === color}
                    onClick={() => setColor(name, color)}
                    className={cn(
                      'size-4 rounded-full border border-border/60 transition-transform hover:scale-110',
                      SWATCH_CLASSES[color],
                      (tagColors[name] ?? 'ocean') === color && 'ring-2 ring-ring ring-offset-1 ring-offset-card',
                    )}
                  />
                ))}
                <button
                  aria-label={`Rename #${name}`}
                  onClick={() => {
                    setEditing(editing === name ? null : name);
                    setRenameTo(name);
                  }}
                  className="ml-1 rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
              </span>
              {editing === name ? (
                <span className="flex w-full items-center gap-2 pl-1">
                  <Input
                    autoFocus
                    className="h-8 w-44"
                    value={renameTo}
                    onChange={(e) => setRenameTo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename(name);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={renameTag.isPending || !renameTo.trim() || renameTo.trim().replace(/^#/, '') === name}
                    onClick={() => submitRename(name)}
                  >
                    {tags && renameTo.trim().replace(/^#/, '') in tags ? 'Merge' : 'Rename'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Renaming rewrites the tag in every memo you own, nested tags included — and each rewritten
        memo keeps its old words in <span className="font-semibold">⋯ → History</span>. Colors are
        yours alone; other members see their own.
      </p>
      {status ? <p className="mt-1 text-xs font-semibold text-ocean">{status}</p> : null}

      <Dialog open={merge != null} onOpenChange={(open) => (open ? null : setMerge(null))}>
        <DialogContent
          title={merge ? `Merge #${merge.from} into #${merge.to}?` : ''}
          description={
            merge
              ? `#${merge.to} already has ${tags?.[merge.to] ?? 0} memo(s). Merging pours every #${merge.from} memo into it — each rewritten memo keeps its old words in History, so nothing is lost.`
              : ''
          }
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={renameTag.isPending} onClick={() => merge && doRename(merge.from, merge.to)}>
              Merge them
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function MembersSection() {
  const { data } = useMembers(true);
  const { data: viewer } = useViewer();
  const { data: profile } = useInstanceProfile();
  const queryClient = useQueryClient();
  const { status, flash } = useStatus();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailEnabled = profile?.emailEnabled ?? false;

  const act = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: keys.members });
      flash(success);
    } catch (error) {
      flash(error instanceof ApiError ? error.message : 'Action failed');
    }
  };

  return (
    <SectionCard title="Members">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="username" className="w-32" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Input
          placeholder="email"
          type="email"
          className="w-44"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          placeholder={emailEnabled ? 'password (blank = invite)' : 'password'}
          type="password"
          className="w-44"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          size="sm"
          disabled={!username || !email || (!password && !emailEnabled)}
          onClick={() =>
            void act(async () => {
              await api('POST', '/api/v1/users', {
                username,
                email,
                ...(password ? { password } : {}),
              });
              setUsername('');
              setEmail('');
              setPassword('');
            }, password ? 'Member added' : 'Invite sent 📨')
          }
        >
          {password || !emailEnabled ? 'Add member' : 'Send invite'}
        </Button>
        {status ? <span className="text-xs font-semibold text-ocean">{status}</span> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        {(data?.users ?? []).map((user) => (
          <div key={user.username} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {user.nickname}
                <span className="ml-1 font-normal text-muted-foreground">@{user.username}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {user.role === 'ADMIN' ? 'Reef keeper (admin)' : 'Member'}
                {user.rowStatus === 'ARCHIVED' ? ' · archived' : ''}
              </p>
            </div>
            {user.username !== viewer?.username ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void act(
                    () =>
                      api('PATCH', `/api/v1/users/${user.username}/admin`, {
                        rowStatus: user.rowStatus === 'ARCHIVED' ? 'NORMAL' : 'ARCHIVED',
                      }),
                    user.rowStatus === 'ARCHIVED' ? 'Member restored' : 'Member archived',
                  )
                }
              >
                {user.rowStatus === 'ARCHIVED' ? 'Restore' : 'Archive'}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function InstanceSection() {
  const { data } = useInstanceSettings(true);
  const queryClient = useQueryClient();
  const { status, flash } = useStatus();
  const [reaction, setReaction] = useState('');

  const patch = async (body: unknown, success: string) => {
    try {
      await api('PATCH', '/api/v1/instance/settings', body);
      await queryClient.invalidateQueries({ queryKey: keys.instanceSettings });
      await queryClient.invalidateQueries({ queryKey: keys.instance });
      await queryClient.invalidateQueries({ queryKey: keys.instanceMemoSetting });
      flash(success);
    } catch (error) {
      flash(error instanceof ApiError ? error.message : 'Could not save');
    }
  };

  if (!data) return null;
  const { general, memo } = data;

  const toggle = (label: string, value: boolean, onChange: (next: boolean) => void) => (
    <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
      <span className="text-sm font-semibold">{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[var(--primary)]" />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Reef settings">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Reef name</label>
          <Input
            defaultValue={general.name}
            onBlur={(event) => {
              if (event.target.value !== general.name) {
                void patch({ general: { name: event.target.value } }, 'Name saved');
              }
            }}
          />
          {toggle('Public mode — anyone can browse public memos', general.publicMode, (next) =>
            void patch({ general: { publicMode: next } }, next ? 'Reef is public' : 'Reef is private'),
          )}
          {toggle('Allow sign-ups', general.allowRegistration, (next) =>
            void patch({ general: { allowRegistration: next } }, 'Saved'),
          )}
          {status ? <span className="text-xs font-semibold text-ocean">{status}</span> : null}
        </div>
      </SectionCard>

      <SectionCard title="Reactions">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {memo.reactions.map((emoji) => (
            <button
              key={emoji}
              aria-label={`Remove reaction ${emoji}`}
              className="rounded-lg border border-border px-2 py-1 hover:bg-destructive/10"
              onClick={() => {
                if (memo.reactions.length > 1) {
                  void patch(
                    { memo: { reactions: memo.reactions.filter((candidate) => candidate !== emoji) } },
                    'Reaction removed',
                  );
                }
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="🦀" className="w-20" value={reaction} onChange={(e) => setReaction(e.target.value)} />
          <Button
            size="sm"
            disabled={!reaction.trim()}
            onClick={() => {
              void patch({ memo: { reactions: [...memo.reactions, reaction.trim()] } }, 'Reaction added');
              setReaction('');
            }}
          >
            Add reaction
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

function BackupsSection({ isCloud }: { isCloud: boolean }) {
  const [restoreState, setRestoreState] = useState<'idle' | 'uploading' | 'restarting'>('idle');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const restore = async (file: File) => {
    const sure = window.confirm(
      `Restore from "${file.name}"?\n\nThis replaces ALL current memos, members, and files with the backup's contents, then restarts the reef. The current data is set aside on the server as a safety copy.`,
    );
    if (!sure) return;
    setRestoreError(null);
    setRestoreState('uploading');
    try {
      const result = await apiUpload<{ ok: boolean; restarting: boolean }>('/api/v1/instance/restore', file);
      if (!result.restarting) {
        setRestoreState('idle');
        setRestoreError('Backup restored — restart the server to finish.');
        return;
      }
      setRestoreState('restarting');
      // The server exits to swap databases; poll an API route (proxied in dev,
      // same-origin in prod) until it answers again, then reload.
      const poll = async () => {
        await new Promise((r) => setTimeout(r, 2500));
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            const health = await fetch('/api/v1/instance/profile', { cache: 'no-store' });
            if (health.ok) {
              window.location.reload();
              return;
            }
          } catch {
            // still restarting
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        setRestoreState('idle');
        setRestoreError(
          'The backup is restored, but the server has not come back on its own — if you run it by hand (no Docker restart policy), start it again and refresh this page.',
        );
      };
      void poll();
    } catch (error) {
      setRestoreState('idle');
      setRestoreError(error instanceof ApiError ? error.message : 'Restore failed — nothing was changed');
    }
  };

  if (isCloud) {
    return (
      <div className="flex flex-col gap-4">
        <SectionCard title="Backups">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Your reef is backed up automatically.</span>{' '}
            Every night we take an encrypted snapshot of your entire reef — memos, members,
            and files — and store it off-server. We keep 14 nightly and 8 weekly snapshots.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Need to roll back? Pick a day below — or{' '}
            <a
              href="https://github.com/DavidAllmon/nemomemo/discussions"
              target="_blank"
              rel="noreferrer"
              className="text-ocean underline"
            >
              reach out
            </a>{' '}
            and we&apos;ll help.
          </p>
          <div className="mt-3">
            <Button size="sm" onClick={() => { window.location.href = '/api/v1/instance/backup'; }}>
              Export my reef
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The export is yours to keep — one zip with everything, ready to archive or move
            to a self-hosted reef. Any single memo can be saved as Markdown from its ⋯ →
            Copy menu.
          </p>
        </SectionCard>
        <CloudSnapshotsCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Download a backup">
        <p className="text-sm text-muted-foreground">
          One zip with your whole reef: the database (a safe snapshot, even while everyone
          keeps writing) and every uploaded file. Keep a copy somewhere that isn&apos;t
          this server. 🐟
        </p>
        <div className="mt-3">
          <Button size="sm" onClick={() => { window.location.href = '/api/v1/instance/backup'; }}>
            Download backup
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Want it automatic and off-machine? See the{' '}
          <a
            href="https://trynemomemo.com/docs/deploy#backups"
            target="_blank"
            rel="noreferrer"
            className="text-ocean underline"
          >
            backup guide
          </a>
          . Any single memo can be saved as Markdown from its ⋯ → Copy menu.
        </p>
      </SectionCard>

      <SectionCard title="Restore from a backup">
        <p className="text-sm text-muted-foreground">
          Upload a backup zip and the reef becomes exactly what it was when that backup
          was taken. The current data is set aside on the server first, and the reef
          restarts to finish — everyone is signed out for a few seconds.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void restore(file);
          }}
        />
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={restoreState !== 'idle'}
            onClick={() => fileInput.current?.click()}
          >
            {restoreState === 'uploading'
              ? 'Checking the backup…'
              : restoreState === 'restarting'
                ? 'Restoring — the reef is restarting…'
                : 'Restore from backup…'}
          </Button>
        </div>
        {restoreError ? <p className="mt-2 text-xs font-semibold text-destructive">{restoreError}</p> : null}
      </SectionCard>
    </div>
  );
}

function CloudSnapshotsCard() {
  const { data } = useCloudSnapshots(true);
  const queryClient = useQueryClient();
  const [requestError, setRequestError] = useState<string | null>(null);
  if (!data || (data.snapshots.length === 0 && !data.restore)) return null;

  const restore = data.restore;
  const pending = restore != null && ['queued', 'restoring', 'staged'].includes(restore.state);
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
  const restoreTime = restore ? data.snapshots.find((s) => s.id === restore.snapshotId)?.time : undefined;
  const restoreDay = restoreTime ? day(restoreTime) : '';

  const requestRestore = async (id: string, time: string) => {
    const ok = window.confirm(
      `Take your reef back to the morning of ${day(time)}?\n\nEverything written since then swims away. We keep the current state as a safety copy on the server.`,
    );
    if (!ok) return;
    setRequestError(null);
    try {
      await api('POST', '/api/v1/cloud/snapshots/restore', { snapshotId: id });
      await queryClient.invalidateQueries({ queryKey: keys.cloudSnapshots });
    } catch (error) {
      setRequestError(error instanceof ApiError ? error.message : 'Could not start the restore');
    }
  };

  return (
    <SectionCard title="Go back to an earlier day">
      <p className="text-sm text-muted-foreground">
        Pick a nightly snapshot and your whole reef — memos, members, files — returns to
        how it was that morning. 🕰️🐠
      </p>
      {pending ? (
        <p className="mt-3 text-sm font-semibold text-ocean">
          Restoring your reef{restoreDay ? ` to ${restoreDay}` : ''} — this takes a few minutes. Just keep
          swimming; this page updates itself.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {data.snapshots.map((snapshot) => (
            <li key={snapshot.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{day(snapshot.time)}</span>
              <Button size="sm" variant="outline" onClick={() => void requestRestore(snapshot.id, snapshot.time)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      {restore?.state === 'done' && !pending ? (
        <p className="mt-2 text-xs font-semibold text-ocean">
          Restore complete{restoreDay ? ` — your reef is back to ${restoreDay}` : ''}. 🎉
        </p>
      ) : null}
      {restore?.state === 'failed' ? (
        <p className="mt-2 text-xs font-semibold text-destructive">
          {restore.message ?? 'The restore failed — nothing was changed.'}
        </p>
      ) : null}
      {requestError ? <p className="mt-2 text-xs font-semibold text-destructive">{requestError}</p> : null}
    </SectionCard>
  );
}

function CloudBillingSection({ billing }: { billing: CloudBillingInfo }) {
  const { status, flash } = useStatus();
  const [opening, setOpening] = useState(false);

  const openPortal = async () => {
    setOpening(true);
    try {
      const { url } = await api<{ url: string }>('POST', '/api/v1/cloud/billing/portal');
      window.location.href = url;
    } catch (error) {
      setOpening(false);
      flash(error instanceof ApiError ? error.message : 'Could not open the billing portal');
    }
  };

  const statusCopy: Record<CloudBillingInfo['status'], string> = {
    provisioned: 'Waiting to be claimed',
    active: 'Active — swimming happily',
    past_due: "Past due — a payment didn't make it through",
    suspended: 'Suspended',
    canceled: 'Canceled',
  };

  return (
    <SectionCard title="Billing">
      <p className="text-sm">
        Subscription status:{' '}
        <span className={cn('font-semibold', billing.status === 'active' ? 'text-ocean' : 'text-destructive')}>
          {statusCopy[billing.status]}
        </span>
      </p>
      {billing.limits ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Fair use: up to {billing.limits.maxMembers} members and{' '}
          {Math.round(billing.limits.maxStorageBytes / (1024 * 1024 * 1024))} GB of attachments. Need more? Just ask.
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={opening} onClick={() => void openPortal()}>
          Manage billing
        </Button>
        {status ? <span className="text-xs font-semibold text-ocean">{status}</span> : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Card updates, invoices, and cancellation all live in the Stripe portal — we never see your card.
      </p>
    </SectionCard>
  );
}

export function SettingsPage() {
  const { data: viewer } = useViewer();
  const [section, setSection] = useState<Section>('account');
  const isAdmin = viewer?.role === 'ADMIN';
  const { data: cloudBilling } = useCloudBilling(isAdmin);

  const sections: { id: Section; label: string; adminOnly?: boolean }[] = [
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'tags', label: 'Tags' },
    { id: 'members', label: 'Members', adminOnly: true },
    { id: 'instance', label: 'Reef', adminOnly: true },
    { id: 'backups', label: 'Backups', adminOnly: true },
    ...(cloudBilling ? [{ id: 'billing' as const, label: 'Billing', adminOnly: true }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 font-display text-xl font-bold">
        <SettingsIcon className="size-5 text-ocean" /> Settings
      </h1>
      <nav className="flex gap-1 rounded-xl bg-muted p-0.5">
        {sections
          .filter((entry) => !entry.adminOnly || isAdmin)
          .map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSection(entry.id)}
              className={cn(
                'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground',
                section === entry.id && 'bg-card text-foreground shadow-sm',
              )}
            >
              {entry.label}
            </button>
          ))}
      </nav>
      {section === 'account' ? <AccountSection /> : null}
      {section === 'preferences' ? <PreferencesSection /> : null}
      {section === 'tags' ? <TagsSection /> : null}
      {section === 'members' && isAdmin ? <MembersSection /> : null}
      {section === 'instance' && isAdmin ? <InstanceSection /> : null}
      {section === 'backups' && isAdmin ? <BackupsSection isCloud={Boolean(cloudBilling)} /> : null}
      {section === 'billing' && isAdmin && cloudBilling ? <CloudBillingSection billing={cloudBilling} /> : null}
    </div>
  );
}
