import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const { addContentSearches } = useMemoFilters();

  const submit = () => {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (words.length > 0) addContentSearches(words);
    setQuery('');
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-28 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl focus:outline-none">
          <DialogPrimitive.Title className="sr-only">Search memos</DialogPrimitive.Title>
          <form
            className="flex h-13 items-center gap-3 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memos…"
              aria-label="Search memos"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              ↵
            </kbd>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
