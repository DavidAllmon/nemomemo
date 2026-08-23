import { Fish, Hourglass } from 'lucide-react';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { useDoryPage } from '@/hooks/queries.js';

export function DoryMemoryPage() {
  const { data, isLoading } = useDoryPage();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <Fish className="size-5 text-dory" /> Dory&apos;s Memory
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything currently fading, soonest first — and bottles still at sea.
        </p>
        {(data?.forgottenCount ?? 0) > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Dory has forgotten <span className="font-bold text-dory">{data!.forgottenCount}</span>{' '}
            {data!.forgottenCount === 1 ? 'memo' : 'memos'} for you. 🫧
          </p>
        ) : null}
      </header>

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
              <Fish className="size-4 text-dory" /> Fading
            </h2>
            {(data?.fading.length ?? 0) === 0 ? (
              <EmptyState
                title="Nothing is fading"
                hint="Hand a memo to Dory and it'll wait here until she forgets it."
              />
            ) : (
              data!.fading.map((memo) => <MemoCard key={memo.uid} memo={memo} />)
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
              <Hourglass className="size-4 text-ocean" /> Bottles at sea
            </h2>
            {(data?.bottles.length ?? 0) === 0 ? (
              <EmptyState
                title="No bottles at sea"
                hint="Seal a memo in a bottle and it surfaces on the day you pick."
              />
            ) : (
              data!.bottles.map((memo) => <MemoCard key={memo.uid} memo={memo} />)
            )}
          </section>
        </>
      )}
    </div>
  );
}
