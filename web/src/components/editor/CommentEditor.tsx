import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { useEffect, useRef, useState } from 'react';
import type { Visibility } from '@nemomemo/shared';
import { Button } from '@/components/ui/button.js';
import { useMemberTagCompletions } from '@/components/editor/completions.js';
import { useCreateComment } from '@/hooks/queries.js';

/**
 * The comment composer: same markdown + @member/#tag autocomplete as the memo
 * editor, without the memo-only chrome (visibility, Dory, attachments).
 */
export function CommentEditor({
  memoUid,
  parentVisibility,
}: {
  memoUid: string;
  parentVisibility: Visibility;
}) {
  const createComment = useCreateComment(memoUid);
  const completions = useMemberTagCompletions();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [hasMention, setHasMention] = useState(false);
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          autocompletion({ override: [completions], icons: false }),
          keymap.of([
            { key: 'Mod-Enter', run: () => (submitRef.current(), true) },
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          cmPlaceholder('Add your comment…'),
          EditorView.updateListener.of((viewUpdate) => {
            if (viewUpdate.docChanged) {
              const text = viewUpdate.state.doc.toString();
              setHasContent(text.trim().length > 0);
              setHasMention(/@[a-zA-Z0-9-]/.test(text));
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    const view = viewRef.current;
    const content = view?.state.doc.toString() ?? '';
    if (!content.trim() || createComment.isPending) return;
    createComment.mutate(content, {
      onSuccess: () => {
        view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
      },
    });
  };
  submitRef.current = submit;

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div ref={containerRef} className="max-h-48 min-h-10 overflow-y-auto" />
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
