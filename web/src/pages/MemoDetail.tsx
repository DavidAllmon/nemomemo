import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { Button } from '@/components/ui/button.js';
import { Textarea } from '@/components/ui/misc.js';
import { useComments, useCreateComment, useMemo_, useViewer } from '@/hooks/queries.js';

export function MemoDetailPage() {
  const { uid = '' } = useParams();
  const { data: memo, isLoading, isError } = useMemo_(uid);
  const { data: comments } = useComments(uid);
  const { data: viewer } = useViewer();
  const createComment = useCreateComment(uid);
  const [draft, setDraft] = useState('');

  if (isLoading) return <LoadingState />;
  if (isError || !memo) {
    return (
      <EmptyState
        title="This memo swam away"
        hint="It may be private, deleted — or Dory already forgot it. 🐟"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <MemoCard memo={memo} showCommentsLink={false} />

      <section id="comments">
        <h2 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold text-muted-foreground">
          <MessageCircle className="size-4" /> Comments ({memo.commentCount})
        </h2>
        <div className="flex flex-col gap-3">
          {(comments ?? []).map((comment) => (
            <MemoCard key={comment.uid} memo={comment} showCommentsLink={false} />
          ))}
          {viewer && memo.forgetAt == null ? (
            <div className="rounded-2xl border border-border bg-card p-3">
              <Textarea
                rows={2}
                placeholder="Add your comment…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  disabled={!draft.trim() || createComment.isPending}
                  onClick={() =>
                    createComment.mutate(draft, { onSuccess: () => setDraft('') })
                  }
                >
                  Comment
                </Button>
              </div>
            </div>
          ) : null}
          {memo.forgetAt != null ? (
            <p className="rounded-xl bg-dory-soft px-3 py-2 text-xs font-semibold text-dory">
              This memo will be forgotten — comments go with it. 🫧
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
