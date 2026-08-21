import { Fish } from 'lucide-react';
import { useEffect, useState } from 'react';
import { forgetCountdown } from '@/lib/utils.js';
import { Tip } from '@/components/ui/overlays.js';
import { cn } from '@/lib/utils.js';

/** "Dory forgets this in 23h 🐟" — the blue-tang badge with a live countdown. */
export function DoryBadge({ forgetAt }: { forgetAt: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const remaining = forgetAt - Math.floor(Date.now() / 1000);
  const urgent = remaining < 3600;

  return (
    <Tip label="Dory memos are forgotten 24 hours after they're written. Archive it to keep it.">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-dory/30 bg-dory-soft px-2 py-0.5 text-[11px] font-bold text-dory',
          urgent && 'animate-dory-shimmer border-dory-tail/60',
        )}
      >
        <Fish className="size-3" />
        forgets in {forgetCountdown(forgetAt)}
      </span>
    </Tip>
  );
}
