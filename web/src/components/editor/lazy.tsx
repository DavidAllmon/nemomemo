import { Suspense, lazy, type ComponentProps } from 'react';

// The TipTap/ProseMirror chain is the heaviest dependency in the app; these
// wrappers keep it out of the main bundle so feeds render before the editor
// chunk arrives. All editor call sites import from here, never directly.
const MemoEditorImpl = lazy(() =>
  import('./MemoEditor.js').then((m) => ({ default: m.MemoEditor })),
);
const CommentEditorImpl = lazy(() =>
  import('./CommentEditor.js').then((m) => ({ default: m.CommentEditor })),
);

function EditorFallback() {
  return <div aria-hidden className="min-h-24 rounded-xl bg-accent/40 motion-safe:animate-pulse" />;
}

export function LazyMemoEditor(props: ComponentProps<typeof MemoEditorImpl>) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <MemoEditorImpl {...props} />
    </Suspense>
  );
}

export function LazyCommentEditor(props: ComponentProps<typeof CommentEditorImpl>) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <CommentEditorImpl {...props} />
    </Suspense>
  );
}
