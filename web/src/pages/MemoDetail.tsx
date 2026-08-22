import { MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { EmptyState, LoadingState } from '@/components/EmptyState.js';
import { CommentEditor, type CommentPrefill } from '@/components/editor/CommentEditor.js';
import { MemoCard } from '@/components/memo/MemoCard.js';
import { useComments, useMemo_, useViewer } from '@/hooks/queries.js';
import { cn } from '@/lib/utils.js';

export function MemoDetailPage() {
  const { uid = '' } = useParams();
  const location = useLocation();
  const { data: memo, isLoading, isError } = useMemo_(uid);
  const { data: comments } = useComments(uid);
  const { data: viewer } = useViewer();
  const [prefill, setPrefill] = useState<CommentPrefill | undefined>();
  const [highlightUid, setHighlightUid] = useState<string | null>(null);
  const scrolledRef = useRef(false);

  // Deep links like #comment-<uid> (inbox notifications) scroll to that comment
  // and light it up briefly once the thread has loaded.
  useEffect(() => {
    if (scrolledRef.current || !comments) return;
    const match = /^#comment-(.+)$/.exec(location.hash);
    if (!match) return;
    const target = document.getElementById(`comment-${match[1]}`);
    if (!target) return;
    scrolledRef.current = true;
    target.scrollIntoView({ block: 'center' });
    setHighlightUid(match[1]!);
    const timer = setTimeout(() => setHighlightUid(null), 2500);
    return () => clearTimeout(timer);
  }, [comments, location.hash]);

  if (isLoading) return <LoadingState />;
  if (isError || !memo) {
    return (
      <EmptyState
        title="This memo swam away"
        hint="It may be private, deleted — or Dory already forgot it. 🐟"
      />
    );
  }

  // A comment's home is its conversation — land there with the comment lit up.
  if (memo.parentUid) {
    return <Navigate to={`/memos/${memo.parentUid}#comment-${memo.uid}`} replace />;
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
            <div
              key={comment.uid}
              id={`comment-${comment.uid}`}
              className={cn(
                'rounded-2xl transition-shadow duration-700',
                highlightUid === comment.uid && 'ring-2 ring-primary/50',
              )}
            >
              <MemoCard
                memo={comment}
                showCommentsLink={false}
                onReply={
                  viewer && memo.forgetAt == null
                    ? () =>
                        setPrefill((previous) => ({
                          text: `@${comment.creator.username} `,
                          nonce: (previous?.nonce ?? 0) + 1,
                        }))
                    : undefined
                }
              />
            </div>
          ))}
          {viewer && memo.forgetAt == null ? (
            <CommentEditor memoUid={uid} parentVisibility={memo.visibility} prefill={prefill} />
          ) : null}
          {!viewer && memo.forgetAt == null ? (
            <p className="rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
              <Link to={`/auth?redirect=/memos/${uid}`} className="text-ocean hover:underline">
                Sign in
              </Link>{' '}
              to join the conversation. 🐟
            </p>
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
