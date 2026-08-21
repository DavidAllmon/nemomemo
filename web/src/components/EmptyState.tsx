import { NemoLogo } from '@/components/NemoLogo.js';
import { Spinner } from '@/components/ui/misc.js';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <NemoLogo bob className="size-14 opacity-80" />
      <p className="font-display text-base font-bold">{title}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-14">
      <Spinner className="size-6" />
      <p className="text-sm text-muted-foreground">Just keep swimming…</p>
    </div>
  );
}
