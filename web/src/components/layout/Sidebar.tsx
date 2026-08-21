import {
  Archive,
  Bell,
  Compass,
  House,
  Info,
  LogOut,
  Moon,
  Paperclip,
  Search,
  Settings,
  Sun,
  SunMoon,
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
import { useInbox, useViewer } from '@/hooks/queries.js';
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await api('POST', '/api/v1/auth/signout');
    queryClient.clear();
    navigate('/explore');
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <Link to={viewer ? '/' : '/explore'} className="flex items-center gap-1.5">
          <NemoLogo className="size-7" />
          <Wordmark />
        </Link>
        <Button variant="ghost" size="icon" aria-label="Search (⌘K)" onClick={onSearch}>
          <Search className="size-4" />
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {viewer ? <NavItem to="/" icon={<House className="size-4" />} label="Home" /> : null}
        <NavItem to="/explore" icon={<Compass className="size-4" />} label="Explore" />
        {viewer ? (
          <>
            <NavItem to="/archived" icon={<Archive className="size-4" />} label="Archived" />
            <NavItem to="/attachments" icon={<Paperclip className="size-4" />} label="Attachments" />
            <NavItem
              to="/inbox"
              icon={<Bell className="size-4" />}
              label="Inbox"
              badge={inbox?.unreadCount || undefined}
            />
          </>
        ) : (
          <NavItem to="/about" icon={<Info className="size-4" />} label="About" />
        )}
      </nav>

      {viewer ? (
        <>
          <CalendarHeatmap username={viewer.username} />
          <ViewsList />
          {/* Only the tags section scrolls when it overflows. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TagTree />
          </div>
        </>
      ) : null}

      <div className="mt-auto shrink-0 pt-2">
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
