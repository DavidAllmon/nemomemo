import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { NemoLogo, Wordmark } from '@/components/NemoLogo.js';
import { SearchDialog } from '@/components/filters/SearchDialog.js';
import { ShortcutsDialog } from '@/components/ShortcutsDialog.js';
import { Sidebar } from '@/components/layout/Sidebar.js';
import { Button } from '@/components/ui/button.js';
import { useCloudBilling, useInstanceProfile, useViewer } from '@/hooks/queries.js';
import { useShortcuts } from '@/hooks/use-shortcuts.js';
import { cn } from '@/lib/utils.js';

/** Hosted reefs only: reefkeepers see when a payment needs attention. */
function PastDueBanner() {
  const { data: viewer } = useViewer();
  const { data: billing } = useCloudBilling(viewer?.role === 'ADMIN');
  if (billing?.status !== 'past_due') return null;
  return (
    <div className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      <span className="font-semibold">A payment didn't make it through the current. 🐡</span>{' '}
      Update your card in{' '}
      <Link to="/settings" className="font-semibold underline">
        Settings → Billing
      </Link>{' '}
      to keep your reef swimming.
    </div>
  );
}

/** One line when the reef's version changes since your last visit. */
function WhatsNewBanner() {
  const { data: profile } = useInstanceProfile();
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(() => {
    try {
      return localStorage.getItem('nemo-last-seen-version');
    } catch {
      return undefined; // storage unavailable: never show
    }
  });
  const version = profile?.version;
  useEffect(() => {
    // First visit: remember silently — don't greet newcomers with a changelog.
    if (version && lastSeen === null) {
      try {
        localStorage.setItem('nemo-last-seen-version', version);
      } catch {
        // ignore
      }
      setLastSeen(version);
    }
  }, [version, lastSeen]);
  if (!version || lastSeen == null || lastSeen === version) return null;
  const dismiss = () => {
    try {
      localStorage.setItem('nemo-last-seen-version', version);
    } catch {
      // ignore
    }
    setLastSeen(version);
  };
  return (
    <div className="mb-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        NemoMemo swam up to <span className="font-semibold">v{version}</span> —{' '}
        <a
          href="https://trynemomemo.com/changelog"
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline"
        >
          see what's new
        </a>{' '}
        🐟
      </span>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 font-bold text-muted-foreground hover:text-foreground">
        ✕
      </button>
    </div>
  );
}

/** When email is set up on this instance, nudge accounts that aren't rescuable yet. */
function EmailNudgeBanner() {
  const { data: viewer } = useViewer();
  const { data: profile } = useInstanceProfile();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('nemo-email-nudge') === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || !viewer || !profile?.emailEnabled) return null;
  const missing = !viewer.email;
  const unverified = !!viewer.email && viewer.emailVerified === false;
  if (!missing && !unverified) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('nemo-email-nudge', '1');
    } catch {
      // ignore
    }
  };
  return (
    <div className="mb-4 flex items-center gap-2 rounded-2xl border border-ocean/30 bg-ocean/10 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        {missing ? (
          <>
            <span className="font-semibold">Add your email</span> so your account can always be
            rescued — set it in{' '}
            <Link to="/settings" className="font-semibold underline">
              Settings
            </Link>
            . 🛟
          </>
        ) : (
          <>
            <span className="font-semibold">Check your inbox</span> — we sent a link to verify{' '}
            {viewer.email}. Lost it? Resend from{' '}
            <Link to="/settings" className="font-semibold underline">
              Settings
            </Link>
            .
          </>
        )}
      </span>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 font-bold text-muted-foreground hover:text-foreground">
        ✕
      </button>
    </div>
  );
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();

  useShortcuts({ onSearch: () => setSearchOpen(true), onHelp: () => setHelpOpen(true) });

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-dvh md:flex md:h-dvh md:overflow-hidden">
      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-md md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <Link to="/" className="flex items-center gap-1.5">
          <NemoLogo className="size-6" />
          <Wordmark className="text-base" />
        </Link>
      </header>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto bg-sidebar shadow-2xl">
            <Sidebar onSearch={() => setSearchOpen(true)} />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar: flush left, always touching top and bottom, never scrolls
          itself — only its tags section scrolls internally. */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar md:block md:h-dvh">
        <Sidebar onSearch={() => setSearchOpen(true)} />
      </aside>
      {/* Main area spans to the window's right edge so the page scrollbar sits
          flush right; content centers within it. */}
      <main className="min-w-0 flex-1 px-3 py-4 md:h-dvh md:overflow-y-auto md:px-6">
        {/* Reading column by default; the calendar grid needs the extra room. */}
        <div className={cn('mx-auto w-full', location.pathname === '/calendar' ? 'max-w-5xl' : 'max-w-2xl')}>
          <PastDueBanner />
          <WhatsNewBanner />
          <EmailNudgeBanner />
          <Outlet />
        </div>
      </main>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
