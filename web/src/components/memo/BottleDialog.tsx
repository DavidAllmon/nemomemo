import { Hourglass } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/overlays.js';
import { cn } from '@/lib/utils.js';

/**
 * The bottle's send-off. Picking a surface date should feel like choosing how
 * far out to sea to throw it — tide presets first, a calendar for anything
 * else, and a plain-words preview of when it washes ashore.
 */

/** Bottles surface with the morning tide unless the sender says otherwise. */
const MORNING_TIDE = '09:00';

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toTimeInput = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

function morningTideIn(days: number, months = 0): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}

const PRESETS = [
  { key: 'tomorrow', label: 'Tomorrow', when: () => morningTideIn(1) },
  { key: 'week', label: 'In a week', when: () => morningTideIn(7) },
  { key: 'month', label: 'In a month', when: () => morningTideIn(0, 1) },
  { key: 'year', label: 'In a year', when: () => morningTideIn(0, 12) },
] as const;

/** "in 7 days" / "in about 3 months" — the felt distance, not the math. */
function seaDistance(target: Date, now: Date): string {
  const days = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (days < 1) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  if (days < 330) return `in about ${Math.round(days / 30)} months`;
  if (days < 550) return 'in about a year';
  return `in about ${Math.round(days / 365)} years`;
}

function ashoreDate(target: Date, now: Date): string {
  return target.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: target.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function BottleDialog({
  open,
  onOpenChange,
  surfaceAt,
  onSeal,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The memo's current surface date, if it's already at sea. */
  surfaceAt: number | null;
  onSeal: (epoch: number) => void;
  onClear: () => void;
}) {
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState(MORNING_TIDE);

  // Each opening starts from the memo's current send-off (or a blank slate).
  useEffect(() => {
    if (!open) return;
    if (surfaceAt != null) {
      const current = new Date(surfaceAt * 1000);
      setDateInput(toDateInput(current));
      setTimeInput(toTimeInput(current));
    } else {
      setDateInput('');
      setTimeInput(MORNING_TIDE);
    }
  }, [open, surfaceAt]);

  const now = new Date();
  const target = dateInput ? new Date(`${dateInput}T${timeInput || MORNING_TIDE}`) : null;
  const valid = target != null && !Number.isNaN(target.getTime()) && target.getTime() > now.getTime();
  const tooEarly = target != null && !Number.isNaN(target.getTime()) && !valid;

  // The signature: how far out to sea the bottle drifts, log-scaled so
  // tomorrow hugs the shore and a year sits out near the horizon.
  const days = valid ? Math.max(0.5, (target.getTime() - now.getTime()) / 86_400_000) : 0;
  const driftPct = valid ? Math.min(92, (Math.log(days + 1) / Math.log(731)) * 92) : 0;

  const matchesPreset = (when: () => Date) => {
    const preset = when();
    return dateInput === toDateInput(preset) && timeInput === toTimeInput(preset);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Message in a bottle"
        description="Throw this memo out to sea — it stays hidden, even from your own feed, until it washes ashore in your inbox."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="How far out to sea">
            {PRESETS.map((preset) => {
              const selected = matchesPreset(preset.when);
              return (
                <button
                  key={preset.key}
                  aria-pressed={selected}
                  onClick={() => {
                    const when = preset.when();
                    setDateInput(toDateInput(when));
                    setTimeInput(toTimeInput(when));
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                    selected
                      ? 'border-ocean/50 bg-accent text-ocean'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Surface day"
              value={dateInput}
              min={toDateInput(now)}
              onChange={(event) => setDateInput(event.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="time"
              aria-label="At what time"
              value={timeInput}
              onChange={(event) => setTimeInput(event.target.value)}
              className="w-32 rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </div>

          {/* How far the bottle drifts: shore on the left, horizon on the right. */}
          <div aria-hidden className="relative h-6">
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
            <div className="absolute left-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-muted-foreground/60" />
            <Hourglass
              className={cn(
                'absolute top-1/2 size-4 -translate-y-1/2 text-ocean motion-safe:transition-[left] motion-safe:duration-500',
                !valid && 'opacity-30',
              )}
              style={{ left: `${driftPct}%` }}
            />
          </div>

          <p aria-live="polite" className="min-h-5 text-sm">
            {valid ? (
              <>
                Washes ashore <span className="font-bold">{ashoreDate(target, now)}</span>{' '}
                <span className="text-muted-foreground">· {seaDistance(target, now)} 🌊</span>
              </>
            ) : tooEarly ? (
              <span className="text-destructive">That tide&apos;s already gone out — pick a later moment.</span>
            ) : (
              <span className="text-muted-foreground">Pick a tide, or choose your own day.</span>
            )}
          </p>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          {surfaceAt != null ? (
            <Button
              variant="outline"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
            >
              Pull it back ashore
            </Button>
          ) : (
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
          )}
          <Button
            disabled={!valid}
            onClick={() => {
              onSeal(Math.floor(target!.getTime() / 1000));
              onOpenChange(false);
            }}
          >
            Seal the bottle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
