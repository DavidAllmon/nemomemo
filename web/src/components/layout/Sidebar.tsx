import {
  Archive,
  Bell,
  CalendarDays,
  Compass,
  Fish,
  House,
  Info,
  LogOut,
  Moon,
  Paperclip,
  Search,
  Settings,
  Shuffle,
  Sun,
  SunMoon,
  Trash2,
  User,
} from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarHeatmap } from '@/components/layout/CalendarHeatmap.js';
import { TagTree } from '@/components/layout/TagTree.js';
import { ViewsList } from '@/components/layout/ViewsList.js';
import { NemoLogo, Wordmark } from '@/components/NemoLogo.js';
import { Avatar } from '@/components/ui/misc.js';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlays.js';
import { useTheme, type Theme } from '@/context/theme.js';
import { useInbox, useRandomMemo, useViewer } from '@/hooks/queries.js';
import { api } from '@/lib/api.js';
import { cn } from '@/lib/utils.js';

function NavItem({
  to,
  icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors',
          'hover:bg-accent hover:text-foreground',
          isActive && 'bg-accent text-foreground',
        )
      }
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

const THEME_LABELS: Record<Theme, string> = {
  system: 'Match the tide',
  shallows: 'Shallows (light)',
  'deep-sea': 'Deep Sea (dark)',
};

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { data: viewer } = useViewer();
  const { data: inbox } = useInbox('UNREAD', !!viewer);
  const { theme, setTheme } = useTheme();
  const goFish = useRandomMemo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await api('POST', '/api/v1/auth/signout');
    queryClient.clear();
    navigate('/explore');
  };

  return (
    /* Brand and account stay pinned; everything that can grow — nav, calendar,
       views, tags — shares the one scroll area between them. Short laptop
       viewports used to clip the account menu clean off the bottom. */
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="flex shrink-0 items-center justify-between pb-4">
        <Link to={viewer ? '/' : '/explore'} className="flex items-center gap-1.5">
          <NemoLogo className="size-7" />
          <Wordmark />
        </Link>
        <Button variant="ghost" size="icon" aria-label="Search (⌘K)" onClick={onSearch}>
          <Search className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <nav className="flex flex-col gap-0.5">
          {viewer ? <NavItem to="/" icon={<House className="size-4" />} label="Home" /> : null}
          <NavItem to="/explore" icon={<Compass className="size-4" />} label="Explore" />
          {viewer ? (
            <>
              <NavItem to="/calendar" icon={<CalendarDays className="size-4" />} label="Calendar" />
              <NavItem to="/archived" icon={<Archive className="size-4" />} label="Archived" />
              <NavItem to="/dory" icon={<Fish className="size-4" />} label="Dory" />
              <NavItem to="/trash" icon={<Trash2 className="size-4" />} label="Trash" />
              <NavItem to="/attachments" icon={<Paperclip className="size-4" />} label="Attachments" />
              <NavItem
                to="/inbox"
                icon={<Bell className="size-4" />}
                label="Inbox"
                badge={inbox?.unreadCount || undefined}
              />
              {/* Imperative, so a button rather than a NavLink. */}
              <button
                onClick={() =>
                  goFish.mutate(undefined, {
                    onSuccess: (memo) => navigate(`/memos/${memo.uid}`),
                  })
                }
                disabled={goFish.isPending}
                title="Swim up a random memo"
                className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <Shuffle className="size-4" />
                <span className="flex-1 text-left">Go fish</span>
              </button>
            </>
          ) : (
            <NavItem to="/about" icon={<Info className="size-4" />} label="About" />
          )}
        </nav>

        {viewer ? (
          <>
            <CalendarHeatmap username={viewer.username} />
            <ViewsList />
            <div>
              <TagTree />
            </div>
          </>
        ) : null}
      </div>

      {/* Hairline marks where the scrolling middle ends and the pinned
          account row begins — without it a clipped tag row reads as a glitch. */}
      <div className="shrink-0 border-t border-border pt-3">
        {viewer ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-accent">
                <Avatar name={viewer.nickname} avatarUrl={viewer.avatarUrl} className="size-7" />
                <span className="truncate text-sm font-bold">{viewer.nickname}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onSelect={() => navigate(`/u/${viewer.username}`)}>
                <User className="size-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {(Object.keys(THEME_LABELS) as Theme[]).map((option) => (
                <DropdownMenuItem key={option} onSelect={() => setTheme(option)}>
                  {option === 'system' ? (
                    <SunMoon className="size-4" />
                  ) : option === 'shallows' ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                  {THEME_LABELS[option]}
                  {theme === option ? <span className="ml-auto text-primary">✓</span> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/settings')}>
                <Settings className="size-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate('/about')}>
                <Info className="size-4" /> About
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button className="w-full" onClick={() => navigate('/auth')}>
            Sign in to NemoMemo
          </Button>
        )}
      </div>
    </div>
  );
}
