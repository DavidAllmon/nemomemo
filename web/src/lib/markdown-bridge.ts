import { Editor, type Extensions } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';

/**
 * The single source of truth for how NemoMemo turns stored markdown into a
 * rich (WYSIWYG) document and back. Every editor instance and every test goes
 * through these extensions so round-trip behavior can never drift.
 */
export function markdownExtensions(): Extensions {
  return [
    StarterKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown,
  ];
}

/** Parse markdown into a detached editor (tests + one-off conversions). */
export function createHeadlessEditor(markdown: string): Editor {
  return new Editor({
    extensions: markdownExtensions(),
    content: markdown,
    contentType: 'markdown',
  });
}

/** markdown → rich document → markdown. The fidelity contract lives here. */
export function markdownRoundTrip(markdown: string): string {
  const editor = createHeadlessEditor(markdown);
  try {
    return serializeMarkdown(editor);
  } finally {
    editor.destroy();
  }
}

/**
 * Serialize an editor back to NemoMemo markdown. Wraps TipTap's serializer so
 * any escaping corrections stay in exactly one place.
 */
export function serializeMarkdown(editor: Editor): string {
  return editor.getMarkdown();
}
