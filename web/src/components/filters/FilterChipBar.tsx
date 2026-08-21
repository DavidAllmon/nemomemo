import { X } from 'lucide-react';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';
import { chipKey, chipLabel } from '@/lib/filter-chips.js';

export function FilterChipBar() {
  const { chips, removeChip } = useMemoFilters();
  if (chips.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chipKey(chip)}
          className="flex h-7 items-center gap-1 rounded-full border border-border bg-accent/60 px-2.5 text-xs font-semibold"
        >
          <span className="max-w-36 truncate">{chipLabel(chip)}</span>
          <button
            aria-label={`Remove filter ${chipLabel(chip)}`}
            onClick={() => removeChip(chip)}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
