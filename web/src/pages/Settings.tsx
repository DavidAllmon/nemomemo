import { useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import type { Visibility } from '@nemomemo/shared';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/misc.js';
import { useTheme, type Theme } from '@/context/theme.js';
import {
  keys,
  useInstanceSettings,
  useMembers,
  useUpdateUserSettings,
  useUserSettings,
  useViewer,
} from '@/hooks/queries.js';
import { api, ApiError } from '@/lib/api.js';
import { cn } from '@/lib/utils.js';

type Section = 'account' | 'preferences' | 'members' | 'instance';

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
  const queryClient = useQueryClient();
  const { status, flash } = useStatus();
  const [nickname, setNickname] = useState(viewer?.nickname ?? '');
  const [email, setEmail] = useState(viewer?.email ?? '');
  const [description, setDescription] = useState(viewer?.description ?? '');
  const [password, setPassword] = useState('');

  const save = async () => {
    try {
      await api('PATCH', '/api/v1/users/-/account', {
        nickname,
        email,
        description,
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
        <label className="text-xs font-semibold text-muted-foreground">Nickname</label>
        <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <label className="text-xs font-semibold text-muted-foreground">Email (optional)</label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="text-xs font-semibold text-muted-foreground">About you</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="text-xs font-semibold text-muted-foreground">New password (leave blank to keep)</label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
  const { status, flash } = useStatus();
  const [renameFrom, setRenameFrom] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const queryClient = useQueryClient();

  const renameTag = async () => {
    try {
      const result = await api<{ changed: number }>('POST', '/api/v1/users/-/tags/rename', {
        from: renameFrom,
        to: renameTo,
      });
      await queryClient.invalidateQueries({ queryKey: ['memos'] });
      await queryClient.invalidateQueries({ queryKey: keys.tags });
      flash(`Renamed in ${result.changed} memo(s)`);
      setRenameFrom('');
      setRenameTo('');
    } catch (error) {
      flash(error instanceof ApiError ? error.message : 'Could not rename');
    }
  };

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

      <SectionCard title="Rename a tag">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="old-tag"
            className="w-40"
            value={renameFrom}
            onChange={(e) => setRenameFrom(e.target.value)}
          />
          <span className="text-muted-foreground">→</span>
          <Input
            placeholder="new-tag"
            className="w-40"
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
          />
          <Button size="sm" disabled={!renameFrom || !renameTo} onClick={() => void renameTag()}>
            Rename everywhere
          </Button>
          {status ? <span className="text-xs font-semibold text-ocean">{status}</span> : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Rewrites the tag in every memo you own, including nested tags like{' '}
          <code className="font-mono">old-tag/idea</code>.
        </p>
      </SectionCard>
    </div>
  );
}

function MembersSection() {
  const { data } = useMembers(true);
  const queryClient = useQueryClient();
  const { status, flash } = useStatus();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

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
        <Input placeholder="username" className="w-36" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Input
          placeholder="password"
          type="password"
          className="w-36"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          size="sm"
          disabled={!username || !password}
          onClick={() =>
            void act(async () => {
              await api('POST', '/api/v1/users', { username, password });
              setUsername('');
              setPassword('');
            }, 'Member added')
          }
        >
          Add member
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

export function SettingsPage() {
  const { data: viewer } = useViewer();
  const [section, setSection] = useState<Section>('account');
  const isAdmin = viewer?.role === 'ADMIN';

  const sections: { id: Section; label: string; adminOnly?: boolean }[] = [
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'members', label: 'Members', adminOnly: true },
    { id: 'instance', label: 'Reef', adminOnly: true },
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
      {section === 'members' && isAdmin ? <MembersSection /> : null}
      {section === 'instance' && isAdmin ? <InstanceSection /> : null}
    </div>
  );
}
