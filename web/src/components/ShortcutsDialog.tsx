import * as DialogPrimitive from '@radix-ui/react-dialog';
import { SHORTCUTS } from '@/hooks/use-shortcuts.js';

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-24 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl focus:outline-none">
          <DialogPrimitive.Title className="font-display text-base font-bold">
            Keyboard shortcuts
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
            All of these rest while you're typing — the editor keeps every key it needs.
          </DialogPrimitive.Description>
          <dl className="mt-4 flex flex-col gap-1.5">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label} className="flex items-center gap-3 text-sm">
                <dt className="flex w-24 shrink-0 justify-end gap-1">
                  {shortcut.keys.map((key) => (
                    <kbd
                      key={key}
                      className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                    >
                      {key}
                    </kbd>
                  ))}
                </dt>
                <dd className="text-muted-foreground">{shortcut.label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Press <kbd className="rounded border border-border bg-muted px-1 font-mono">?</kbd> any
            time to see this again. 🐟
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
