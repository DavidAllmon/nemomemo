import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { NemoLogo, Wordmark } from '@/components/NemoLogo.js';
import { SearchDialog } from '@/components/filters/SearchDialog.js';
import { Sidebar } from '@/components/layout/Sidebar.js';
import { Button } from '@/components/ui/button.js';

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

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
    <div className="min-h-dvh">
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

      <div className="flex w-full">
        {/* Desktop sidebar: flush left, full viewport height */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-r border-border bg-sidebar md:block">
          <Sidebar onSearch={() => setSearchOpen(true)} />
        </aside>
        <main className="min-w-0 flex-1 px-3 py-4 md:px-6">
          <div className="mx-auto w-full max-w-2xl">
            <Outlet />
          </div>
        </main>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
