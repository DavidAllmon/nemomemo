import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import {
  Bold,
  Code,
  Earth,
  Fish,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  Paperclip,
  Strikethrough,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MemoDto, Visibility } from '@nemomemo/shared';
import { Bubbles } from '@/components/Bubbles.js';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tip,
} from '@/components/ui/overlays.js';
import { Spinner } from '@/components/ui/misc.js';
import { useMemberTagCompletions } from '@/components/editor/completions.js';
import {
  useCreateMemo,
  useUpdateMemo,
  useUploadAttachment,
  useUserSettings,
  useViewer,
} from '@/hooks/queries.js';
import { cn } from '@/lib/utils.js';

const DRAFT_KEY = 'nemo-draft-home';

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string; icon: typeof Lock }[] = [
  { value: 'PRIVATE', label: 'Private', hint: 'Only visible to you', icon: Lock },
  { value: 'PROTECTED', label: 'Protected', hint: 'Visible to signed-in users', icon: Users },
  { value: 'PUBLIC', label: 'Public', hint: 'Visible to everyone', icon: Earth },
];

interface UploadedFile {
  uid: string;
  filename: string;
}

export function MemoEditor({ memo, onDone }: { memo?: MemoDto; onDone?: () => void }) {
  const isEdit = !!memo;
  // Comments inherit the parent's visibility and can't be Dory memos — editing
  // one shows neither control and never patches those fields.
  const isComment = memo?.parentUid != null;
  const { data: viewer } = useViewer();
  const { data: settings } = useUserSettings(!!viewer);
  const create = useCreateMemo();
  const update = useUpdateMemo();
  const upload = useUploadAttachment();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const completions = useMemberTagCompletions();
  const [hasContent, setHasContent] = useState(!!memo?.content);
  const [visibility, setVisibility] = useState<Visibility | null>(memo?.visibility ?? null);
  const [dory, setDory] = useState(memo ? memo.forgetAt != null : false);
  const [attachments, setAttachments] = useState<UploadedFile[]>(
    memo?.attachments.map((a) => ({ uid: a.uid, filename: a.filename })) ?? [],
  );
  const [uploading, setUploading] = useState(0);
  const [burst, setBurst] = useState(0);
  const saveRef = useRef<() => void>(() => {});

  const effectiveVisibility = visibility ?? settings?.general.defaultVisibility ?? 'PRIVATE';

  // Build the CodeMirror instance once.
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;
    let initial = memo?.content ?? '';
    if (!isEdit) {
      try {
        initial = localStorage.getItem(DRAFT_KEY) ?? '';
      } catch {
        // ignore
      }
    }
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          autocompletion({ override: [completions], icons: false }),
          keymap.of([
            { key: 'Mod-Enter', run: () => (saveRef.current(), true) },
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          cmPlaceholder('Any thoughts… 🫧'),
          EditorView.updateListener.of((viewUpdate) => {
            if (viewUpdate.docChanged) {
              const text = viewUpdate.state.doc.toString();
              setHasContent(text.trim().length > 0);
              if (!isEdit) {
                try {
                  localStorage.setItem(DRAFT_KEY, text);
                } catch {
                  // ignore
                }
              }
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    setHasContent(initial.trim().length > 0);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getContent = () => viewRef.current?.state.doc.toString() ?? '';

  const wrapSelection = (before: string, after = before) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: `${before}${selected}${after}` },
      selection: { anchor: from + before.length, head: from + before.length + selected.length },
    });
    view.focus();
  };

  const prefixLine = (prefix: string) => {
    const view = viewRef.current;
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const stripped = line.text.replace(/^(#{1,3} |- \[[ x]\] |- |\d+\. )/, '');
    const already = line.text.startsWith(prefix);
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: already ? stripped : prefix + stripped },
    });
    view.focus();
  };

  const insertText = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from } = view.state.selection.main;
    view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + text.length } });
    view.focus();
  };

  const uploadFiles = async (files: FileList | File[]) => {
    setUploading((count) => count + files.length);
    for (const file of files) {
      try {
        const { attachment } = await upload.mutateAsync(file);
        setAttachments((list) => [...list, { uid: attachment.uid, filename: attachment.filename }]);
      } catch {
        // surfaced through mutation state; keep going with other files
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  const save = () => {
    const content = getContent();
    if (!content.trim() && attachments.length === 0) return;
    if (isEdit && memo) {
      update.mutate(
        {
          uid: memo.uid,
          content,
          attachmentUids: attachments.map((a) => a.uid),
          ...(isComment ? {} : { visibility: effectiveVisibility, dory }),
        },
        { onSuccess: () => onDone?.() },
      );
    } else {
      create.mutate(
        {
          content,
          visibility: effectiveVisibility,
          dory,
          attachmentUids: attachments.map((a) => a.uid),
        },
        {
          onSuccess: () => {
            viewRef.current?.dispatch({
              changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' },
            });
            setAttachments([]);
            setDory(false);
            setBurst((n) => n + 1);
            try {
              localStorage.removeItem(DRAFT_KEY);
            } catch {
              // ignore
            }
          },
        },
      );
    }
  };
  saveRef.current = save;

  const pending = create.isPending || update.isPending;
  const canSave = (hasContent || attachments.length > 0) && uploading === 0 && !pending;
  const VisibilityIcon = VISIBILITY_OPTIONS.find((o) => o.value === effectiveVisibility)!.icon;

  const toolbarButton = (label: string, icon: React.ReactNode, action: () => void) => (
    <Tip label={label}>
      <button
        aria-label={label}
        onClick={action}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {icon}
      </button>
    </Tip>
  );

  return (
    <div
      className="relative flex flex-col gap-2"
      onPaste={(event) => {
        const files = [...event.clipboardData.files];
        if (files.length > 0) {
          event.preventDefault();
          void uploadFiles(files);
        }
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length > 0) {
          event.preventDefault();
          void uploadFiles(event.dataTransfer.files);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      <div ref={containerRef} className="max-h-72 min-h-16 overflow-y-auto" />

      {attachments.length > 0 || uploading > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((file) => (
            <span
              key={file.uid}
              className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
            >
              <Paperclip className="size-3" />
              <span className="max-w-32 truncate">{file.filename}</span>
              <button
                aria-label={`Remove ${file.filename}`}
                onClick={() => setAttachments((list) => list.filter((a) => a.uid !== file.uid))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {uploading > 0 ? <Spinner className="size-4" /> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-0.5 border-t border-border pt-2">
        {toolbarButton('Heading 1', <Heading1 className="size-4" />, () => prefixLine('# '))}
        {toolbarButton('Heading 2', <Heading2 className="size-4" />, () => prefixLine('## '))}
        <span className="mx-1 h-4 w-px bg-border" />
        {toolbarButton('Bold', <Bold className="size-4" />, () => wrapSelection('**'))}
        {toolbarButton('Italic', <Italic className="size-4" />, () => wrapSelection('*'))}
        {toolbarButton('Strikethrough', <Strikethrough className="size-4" />, () => wrapSelection('~~'))}
        <span className="mx-1 h-4 w-px bg-border" />
        {toolbarButton('Bullet list', <List className="size-4" />, () => prefixLine('- '))}
        {toolbarButton('Numbered list', <ListOrdered className="size-4" />, () => prefixLine('1. '))}
        {toolbarButton('To-do list', <ListChecks className="size-4" />, () => prefixLine('- [ ] '))}
        {toolbarButton('Code block', <Code className="size-4" />, () => wrapSelection('\n```\n', '\n```\n'))}
        {toolbarButton('Link', <Link2 className="size-4" />, () => insertText('[title](https://)'))}
        <label className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ImageIcon className="size-4" />
          <span className="sr-only">Attach files</span>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        {isComment ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Visibility">
              <VisibilityIcon className="size-3.5" />
              {VISIBILITY_OPTIONS.find((o) => o.value === effectiveVisibility)!.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {VISIBILITY_OPTIONS.map((option) => (
              <DropdownMenuItem key={option.value} onSelect={() => setVisibility(option.value)}>
                <option.icon className="size-4" />
                <span className="flex-1">
                  {option.label}
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
                {effectiveVisibility === option.value ? <span className="text-primary">✓</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        )}

        {isComment ? null : (
        <Tip
          label={
            memo?.pinned
              ? 'Pinned memos are safe from Dory'
              : dory
                ? 'Dory will forget this memo in 24 hours'
                : 'Make this a Dory memo — she forgets it in 24 hours'
          }
        >
          <button
            aria-label="Dory memo"
            aria-pressed={dory}
            disabled={memo?.pinned}
            onClick={() => setDory((value) => !value)}
            className={cn(
              'flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-bold transition-colors',
              dory
                ? 'border-dory/40 bg-dory-soft text-dory'
                : 'border-border text-muted-foreground hover:bg-accent',
              memo?.pinned && 'opacity-40',
            )}
          >
            <Fish className="size-3.5" />
            Dory
          </button>
        </Tip>
        )}

        <span className="ml-auto" />
        {isEdit ? (
          <Button variant="ghost" size="sm" onClick={() => onDone?.()}>
            Cancel
          </Button>
        ) : null}
        <Button size="sm" disabled={!canSave} onClick={save}>
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
        </Button>
      </div>
      <Bubbles burstKey={burst} />
    </div>
  );
}
