import { useEffect, useRef, useState } from 'react';
import type { Visibility } from '@nemomemo/shared';
import { RichEditor, type RichEditorHandle } from '@/components/editor/RichEditor.js';
import { Button } from '@/components/ui/button.js';
import { useCreateComment } from '@/hooks/queries.js';

export interface CommentPrefill {
  text: string;
  nonce: number;
}

/**
 * The comment composer: same WYSIWYG editor as memos with the slim toolbar,
 * without the memo-only chrome (visibility, Dory, attachments).
 */
export function CommentEditor({
  memoUid,
  parentVisibility,
  prefill,
}: {
  memoUid: string;
  parentVisibility: Visibility;
  /** Bump `nonce` to append `text` to the draft and focus (used by Reply). */
  prefill?: CommentPrefill;
}) {
  const createComment = useCreateComment(memoUid);
  const editorRef = useRef<RichEditorHandle>(null);
  const [hasContent, setHasContent] = useState(false);
  const [hasMention, setHasMention] = useState(false);

  useEffect(() => {
    if (!prefill?.text) return;
    editorRef.current?.insertText(prefill.text);
    setHasMention(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  const submit = () => {
    const content = editorRef.current?.getMarkdown() ?? '';
    if (!content.trim() || createComment.isPending) return;
    createComment.mutate(content, {
      onSuccess: () => editorRef.current?.clear(),
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <RichEditor
        ref={editorRef}
        placeholder="Add your comment…"
        variant="slim"
        onSubmit={submit}
        onChangeMarkdown={(markdown) => {
          setHasContent(markdown.trim().length > 0);
          setHasMention(/@[a-zA-Z0-9-]/.test(markdown));
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        {parentVisibility === 'PRIVATE' && hasMention ? (
          <p className="text-xs font-semibold text-muted-foreground">
            Psst — mentions on a private memo don't ping anyone. 🤫
          </p>
        ) : null}
        <span className="ml-auto" />
        <Button size="sm" disabled={!hasContent || createComment.isPending} onClick={submit}>
          {createComment.isPending ? 'Sending…' : 'Comment'}
        </Button>
      </div>
    </div>
  );
}
