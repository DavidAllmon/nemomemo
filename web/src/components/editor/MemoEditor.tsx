import { Earth, Fish, Image as ImageIcon, Lock, Paperclip, Users, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MemoDto, Visibility } from '@nemomemo/shared';
import { Bubbles } from '@/components/Bubbles.js';
import { RichEditor, type RichEditorHandle } from '@/components/editor/RichEditor.js';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tip,
} from '@/components/ui/overlays.js';
import { Spinner } from '@/components/ui/misc.js';
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

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
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

  const editorRef = useRef<RichEditorHandle>(null);
  // The markdown the editor was loaded with: saving identical output skips the
  // content field so serializer normalization never counts as an "edit".
  const loadedMarkdown = useRef(memo?.content ?? loadDraft());
  const [hasContent, setHasContent] = useState(loadedMarkdown.current.trim().length > 0);
  const [visibility, setVisibility] = useState<Visibility | null>(memo?.visibility ?? null);
  const [dory, setDory] = useState(memo ? memo.forgetAt != null : false);
  const [attachments, setAttachments] = useState<UploadedFile[]>(
    memo?.attachments.map((a) => ({ uid: a.uid, filename: a.filename })) ?? [],
  );
  const [uploading, setUploading] = useState(0);
  const [burst, setBurst] = useState(0);

  const effectiveVisibility = visibility ?? settings?.general.defaultVisibility ?? 'PRIVATE';

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
    const content = editorRef.current?.getMarkdown() ?? '';
    if (!content.trim() && attachments.length === 0) return;
    if (isEdit && memo) {
      update.mutate(
        {
          uid: memo.uid,
          // No phantom edits: only send content when the words actually changed.
          ...(content !== loadedMarkdown.current ? { content } : {}),
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
            editorRef.current?.clear();
            loadedMarkdown.current = '';
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

  const pending = create.isPending || update.isPending;
  const canSave = (hasContent || attachments.length > 0) && uploading === 0 && !pending;
  const VisibilityIcon = VISIBILITY_OPTIONS.find((o) => o.value === effectiveVisibility)!.icon;

  return (
    <div className="relative flex flex-col gap-2">
      <RichEditor
        ref={editorRef}
        initialMarkdown={loadedMarkdown.current}
        placeholder="Any thoughts… 🫧"
        variant="full"
        onSubmit={save}
        onFiles={(files) => void uploadFiles(files)}
        onChangeMarkdown={(markdown) => {
          setHasContent(markdown.trim().length > 0);
          if (!isEdit) {
            try {
              localStorage.setItem(DRAFT_KEY, markdown);
            } catch {
              // ignore
            }
          }
        }}
        extraToolbar={
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
        }
      />

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
