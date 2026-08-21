import { Link, useParams } from 'react-router-dom';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { NemoLogo, Wordmark } from '@/components/NemoLogo.js';
import { useSharedMemo } from '@/hooks/queries.js';

/** Public token-shared memo view — standalone page, no app shell. */
export function SharePage() {
  const { token = '' } = useParams();
  const { data: memo, isLoading, isError } = useSharedMemo(token);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
        <Link to="/explore" className="flex items-center gap-1.5 self-center">
          <NemoLogo className="size-7" />
          <Wordmark />
        </Link>
        {isLoading ? (
          <LoadingState />
        ) : isError || !memo ? (
          <EmptyState
            title="This link is invalid or has expired"
            hint="Ask the author for a fresh one."
          />
        ) : (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Shared by <span className="font-semibold">{memo.creator.nickname}</span>
            </p>
            <MemoCard memo={memo} showCommentsLink={false} shareToken={token} />
          </>
        )}
      </div>
    </div>
  );
}
