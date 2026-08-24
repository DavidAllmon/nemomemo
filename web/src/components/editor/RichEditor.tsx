import { Extension, type Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { PluginKey } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Strikethrough,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { markdownExtensions, serializeMarkdown } from '@/lib/markdown-bridge.js';
import { useMentionable, useTags, useViewer } from '@/hooks/queries.js';
import { Tip } from '@/components/ui/overlays.js';

export interface RichEditorHandle {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  insertText: (text: string) => void;
  clear: () => void;
  focus: () => void;
  isEmpty: () => boolean;
}

interface SuggestionItem {
  label: string;
  detail?: string;
}

/**
 * Floating pick-list for @member and #tag suggestions. Plain DOM on purpose:
 * the Suggestion plugin drives it imperatively from ProseMirror, and the chosen
 * item is inserted as PLAIN TEXT — never a custom node — so the markdown
 * round-trip can't be corrupted by it.
 */
function suggestionRenderer(): ReturnType<NonNullable<SuggestionOptions<SuggestionItem>['render']>> {
  let container: HTMLDivElement | null = null;
  let items: SuggestionItem[] = [];
  let selected = 0;
  let executeWith: ((item: SuggestionItem) => void) | null = null;

  const paint = () => {
    if (!container) return;
    container.innerHTML = '';
    items.forEach((item, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className =
        'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm ' +
        (index === selected ? 'bg-accent text-foreground' : 'text-foreground');
      const name = document.createElement('span');
      name.className = 'font-semibold';
      name.textContent = item.label;
      row.appendChild(name);
      if (item.detail) {
        const detail = document.createElement('span');
        detail.className = 'truncate text-xs text-muted-foreground';
        detail.textContent = item.detail;
        row.appendChild(detail);
      }
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        executeWith?.(item);
      });
      container!.appendChild(row);
    });
  };

  const position = (clientRect: (() => DOMRect | null) | null | undefined) => {
    const rect = clientRect?.();
    if (!container || !rect) return;
    container.style.left = `${rect.left + window.scrollX}px`;
    container.style.top = `${rect.bottom + window.scrollY + 4}px`;
  };

  return {
    onStart(props) {
      items = props.items;
      selected = 0;
      executeWith = (item) => props.command(item);
      container = document.createElement('div');
      container.className =
        'absolute z-50 flex max-h-56 w-56 flex-col gap-0.5 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg';
      document.body.appendChild(container);
      paint();
      position(props.clientRect);
    },
    onUpdate(props) {
      items = props.items;
      selected = Math.min(selected, Math.max(0, items.length - 1));
      executeWith = (item) => props.command(item);
      paint();
      position(props.clientRect);
    },
    onKeyDown(props) {
      if (props.event.key === 'Escape') return true;
      if (items.length === 0) return false;
      if (props.event.key === 'ArrowDown') {
        selected = (selected + 1) % items.length;
        paint();
        return true;
      }
      if (props.event.key === 'ArrowUp') {
        selected = (selected + items.length - 1) % items.length;
        paint();
        return true;
      }
      if (props.event.key === 'Enter' || props.event.key === 'Tab') {
        executeWith?.(items[selected]!);
        return true;
      }
      return false;
    },
    onExit() {
      container?.remove();
      container = null;
      executeWith = null;
    },
  };
}

/** Build one plain-text suggestion source (`@` for members, `#` for tags). */
function makeSuggestion(
  name: string,
  char: string,
  getItems: (query: string) => SuggestionItem[],
): Extension {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [
        Suggestion<SuggestionItem>({
          editor: this.editor,
          char,
          pluginKey: new PluginKey(name),
          allowSpaces: false,
          items: ({ query }) => getItems(query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().insertContentAt(range, `${char}${props.label} `).run();
          },
          render: suggestionRenderer,
        }),
      ];
    },
  });
}

export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    initialMarkdown?: string;
    placeholder: string;
    variant: 'full' | 'slim';
    onSubmit?: () => void;
    onChangeMarkdown?: (markdown: string) => void;
    onFiles?: (files: File[]) => void;
    /** Take focus as soon as the editor exists (the `c` shortcut's landing pad). */
    autoFocus?: boolean;
    extraToolbar?: ReactNode;
  }
>(function RichEditor(
  { initialMarkdown = '', placeholder, variant, onSubmit, onChangeMarkdown, onFiles, autoFocus, extraToolbar },
  ref,
) {
  const { data: viewer } = useViewer();
  const { data: mentionable } = useMentionable(!!viewer);
  const { data: tagCounts } = useTags(!!viewer);
  const dataRef = useRef<{ users: SuggestionItem[]; tags: SuggestionItem[] }>({ users: [], tags: [] });
  useEffect(() => {
    dataRef.current = {
      users: (mentionable ?? []).map((member) => ({
        label: member.username,
        detail: member.nickname !== member.username ? member.nickname : undefined,
      })),
      tags: Object.keys(tagCounts ?? {}).map((name) => ({ label: name })),
    };
  }, [mentionable, tagCounts]);

  const submitRef = useRef<(() => void) | undefined>(onSubmit);
  submitRef.current = onSubmit;

  const editor = useEditor({
    extensions: [
      ...markdownExtensions(),
      Placeholder.configure({ placeholder }),
      Extension.create({
        name: 'submitShortcut',
        addKeyboardShortcuts() {
          return { 'Mod-Enter': () => (submitRef.current?.(), true) };
        },
      }),
      makeSuggestion('memberSuggestion', '@', (query) =>
        dataRef.current.users.filter((u) => u.label.toLowerCase().startsWith(query.toLowerCase())).slice(0, 8),
      ),
      makeSuggestion('tagSuggestion', '#', (query) =>
        dataRef.current.tags.filter((t) => t.label.toLowerCase().startsWith(query.toLowerCase())).slice(0, 8),
      ),
    ],
    content: initialMarkdown,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    onUpdate({ editor }) {
      onChangeMarkdown?.(serializeMarkdown(editor as Editor));
    },
    editorProps: {
      attributes: {
        class: 'memo-content rich-editor min-h-16 max-h-72 overflow-y-auto focus:outline-none',
      },
    },
  });

  useImperativeHandle(ref, () => ({
    getMarkdown: () => (editor ? serializeMarkdown(editor) : ''),
    setMarkdown: (markdown) => editor?.commands.setContent(markdown, { contentType: 'markdown' }),
    insertText: (text) => {
      if (!editor) return;
      const { size } = editor.state.doc.content;
      const needsSpace = !editor.state.doc.textBetween(Math.max(0, size - 1), size).match(/^\s*$/);
      editor
        .chain()
        .focus('end')
        .insertContent(`${needsSpace ? ' ' : ''}${text}`)
        .run();
      editor.view.dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    clear: () => editor?.commands.clearContent(true),
    focus: () => editor?.commands.focus(),
    isEmpty: () => editor?.isEmpty ?? true,
  }));

  if (!editor) return null;

  const button = (label: string, icon: ReactNode, action: () => void, active = false) => (
    <Tip label={label}>
      <button
        aria-label={label}
        onClick={action}
        className={
          'rounded-lg p-1.5 hover:bg-accent hover:text-foreground ' +
          (active ? 'bg-accent text-foreground' : 'text-muted-foreground')
        }
      >
        {icon}
      </button>
    </Tip>
  );

  const chain = () => editor.chain().focus();

  return (
    <div
      onPaste={(event) => {
        const files = [...event.clipboardData.files];
        if (files.length > 0 && onFiles) {
          event.preventDefault();
          onFiles(files);
        }
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length > 0 && onFiles) {
          event.preventDefault();
          onFiles([...event.dataTransfer.files]);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      <EditorContent editor={editor} />
      <div className="mt-1 flex flex-wrap items-center gap-0.5 border-t border-border pt-2">
        {variant === 'full' ? (
          <>
            {button('Heading 1', <Heading1 className="size-4" />, () => chain().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
            {button('Heading 2', <Heading2 className="size-4" />, () => chain().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
            <span className="mx-1 h-4 w-px bg-border" />
          </>
        ) : null}
        {button('Bold', <Bold className="size-4" />, () => chain().toggleBold().run(), editor.isActive('bold'))}
        {button('Italic', <Italic className="size-4" />, () => chain().toggleItalic().run(), editor.isActive('italic'))}
        {button('Strikethrough', <Strikethrough className="size-4" />, () => chain().toggleStrike().run(), editor.isActive('strike'))}
        <span className="mx-1 h-4 w-px bg-border" />
        {button('Bullet list', <List className="size-4" />, () => chain().toggleBulletList().run(), editor.isActive('bulletList'))}
        {variant === 'full'
          ? button('Numbered list', <ListOrdered className="size-4" />, () => chain().toggleOrderedList().run(), editor.isActive('orderedList'))
          : null}
        {button('To-do list', <ListChecks className="size-4" />, () => chain().toggleTaskList().run(), editor.isActive('taskList'))}
        {button('Code block', <Code className="size-4" />, () => chain().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
        {variant === 'full'
          ? button('Link', <Link2 className="size-4" />, () => {
              const href = window.prompt('Link to where? (https://…)');
              if (href) chain().toggleLink({ href }).run();
            }, editor.isActive('link'))
          : null}
        {extraToolbar}
      </div>
    </div>
  );
});
