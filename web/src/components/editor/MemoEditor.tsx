import { Earth, Fish, Hourglass, Image as ImageIcon, Lock, Paperclip, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DORY_WINDOWS, type DoryWindow, type MemoDto, type Visibility } from '@nemomemo/shared';
import { Bubbles } from '@/components/Bubbles.js';
import { VoiceControls } from '@/components/editor/VoiceControls.js';
import { RichEditor, type RichEditorHandle, type SlashCommand } from '@/components/editor/RichEditor.js';
import { TemplatesMenu } from '@/components/editor/TemplatesMenu.js';
import { BottleDialog } from '@/components/memo/BottleDialog.js';
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
  useInstanceProfile,
  useUpdateMemo,
  useUploadAttachment,
  useUserSettings,
  useViewer,
} from '@/hooks/queries.js';
import { absoluteTime, cn } from '@/lib/utils.js';

const DRAFT_KEY = 'nemo-draft-home';

const DORY_WINDOW_LABELS: Record<DoryWindow, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '3d': '3 days',
  '7d': '7 days',
};

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

export function MemoEditor({
  memo,
  onDone,
  autoFocus,
}: {
  memo?: MemoDto;
  onDone?: () => void;
  /** Focus on mount — set when the `c` shortcut brought you here. */
  autoFocus?: boolean;
}) {
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

  // `c` pressed while this editor is already on screen. Arriving from another
  // page instead goes through router state -> the autoFocus prop, because a
  // one-shot event would fire long before this lazy chunk finishes mounting.
  useEffect(() => {
    const focus = () => editorRef.current?.focus();
    window.addEventListener('nemo:compose', focus);
    return () => window.removeEventListener('nemo:compose', focus);
  }, []);
  // The markdown the editor was loaded with: saving identical output skips the
  // content field so serializer normalization never counts as an "edit".
  const loadedMarkdown = useRef(memo?.content ?? loadDraft());
  const [hasContent, setHasContent] = useState(loadedMarkdown.current.trim().length > 0);
  const [visibility, setVisibility] = useState<Visibility | null>(memo?.visibility ?? null);
  const initialDory = memo ? memo.forgetAt != null : false;
  const [dory, setDory] = useState(initialDory);
  const [doryWindow, setDoryWindow] = useState<DoryWindow>('24h');
  const [windowTouched, setWindowTouched] = useState(false);
  const initialSurfaceAt = memo?.surfaceAt ?? null;
  const [surfaceAt, setSurfaceAt] = useState<number | null>(initialSurfaceAt);
  const [bottleOpen, setBottleOpen] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFile[]>(
    memo?.attachments.map((a) => ({ uid: a.uid, filename: a.filename })) ?? [],
  );
  const [uploading, setUploading] = useState(0);
  const [burst, setBurst] = useState(0);
  const { data: profile } = useInstanceProfile();
  const [dictationPreview, setDictationPreview] = useState('');

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
      // Dory: only send the flag when toggled or re-windowed, so a plain edit
      // never resets the forget countdown.
      const doryChanged = dory !== initialDory || (dory && windowTouched);
      update.mutate(
        {
          uid: memo.uid,
          // No phantom edits: only send content when the words actually changed.
          ...(content !== loadedMarkdown.current ? { content } : {}),
          attachmentUids: attachments.map((a) => a.uid),
          ...(isComment
            ? {}
            : {
                visibility: effectiveVisibility,
                ...(doryChanged ? { dory, ...(dory ? { doryWindow } : {}) } : {}),
                ...(surfaceAt !== initialSurfaceAt ? { surfaceAt } : {}),
              }),
        },
        { onSuccess: () => onDone?.() },
      );
    } else {
      create.mutate(
        {
          content,
          visibility: effectiveVisibility,
          dory,
          ...(dory ? { doryWindow } : {}),
          ...(surfaceAt != null ? { surfaceAt } : {}),
          attachmentUids: attachments.map((a) => a.uid),
        },
        {
          onSuccess: () => {
            editorRef.current?.clear();
            loadedMarkdown.current = '';
            setAttachments([]);
            setDory(false);
            setDoryWindow('24h');
            setWindowTouched(false);
            setSurfaceAt(null);
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

  // `/dory` in the editor flips the memo's Dory flag — state the editor itself
  // can't reach, so it arrives as a host-provided slash command.
  const slashCommands: SlashCommand[] =
    isComment || memo?.pinned
      ? []
      : [
          {
            label: 'Dory memo',
            detail: dory ? 'she remembers it again' : 'forgets after 24 hours',
            run: () => {
              setDory((current) => !current);
              setDoryWindow('24h');
              setWindowTouched(true);
            },
          },
        ];

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
        autoFocus={autoFocus}
        onSubmit={save}
        extraSlashCommands={slashCommands}
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
          <>
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
            <VoiceControls
              dictationEnabled={profile?.dictationEnabled ?? false}
              onPreview={setDictationPreview}
              onFinalText={(text) => {
                editorRef.current?.insertText(text);
                setHasContent(true);
              }}
              onFile={(file) => void uploadFiles([file])}
            />
          </>
        }
      />

      {dictationPreview ? (
        <p aria-live="polite" className="px-1 text-sm italic text-muted-foreground">
          {dictationPreview}
          <span className="motion-safe:animate-pulse">🫧</span>
        </p>
      ) : null}

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
          <DropdownMenu>
            <Tip
              label={
                memo?.pinned
                  ? 'Pinned memos are safe from Dory'
                  : dory
                    ? `Dory will forget this memo after ${DORY_WINDOW_LABELS[doryWindow]}`
                    : 'Make this a Dory memo — she forgets it after a while'
              }
            >
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Dory memo"
                  aria-pressed={dory}
                  disabled={memo?.pinned}
                  className={cn(
                    'flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-bold transition-colors',
                    dory
                      ? 'border-dory/40 bg-dory-soft text-dory'
                      : 'border-border text-muted-foreground hover:bg-accent',
                    memo?.pinned && 'opacity-40',
                  )}
                >
                  <Fish className="size-3.5" />
                  {dory ? `Dory · ${doryWindow}` : 'Dory'}
                </button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="start" className="w-48">
              {dory ? (
                <DropdownMenuItem onSelect={() => setDory(false)}>
                  Off — Dory remembers it
                </DropdownMenuItem>
              ) : null}
              {DORY_WINDOWS.map((window) => (
                <DropdownMenuItem
                  key={window}
                  onSelect={() => {
                    setDory(true);
                    setDoryWindow(window);
                    setWindowTouched(true);
                  }}
                >
                  <Fish className="size-4 text-dory" />
                  <span className="flex-1">Forget after {DORY_WINDOW_LABELS[window]}</span>
                  {dory && doryWindow === window ? <span className="text-primary">✓</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isComment ? null : (
          <Tip
            label={
              memo?.pinned
                ? "Pinned memos can't go to sea"
                : surfaceAt != null
                  ? `Sealed in a bottle — surfaces ${absoluteTime(surfaceAt)}`
                  : 'Seal it in a bottle — hidden until the day you pick'
            }
          >
            <button
              aria-label="Message in a bottle"
              aria-pressed={surfaceAt != null}
              disabled={memo?.pinned}
              onClick={() => setBottleOpen(true)}
              className={cn(
                'flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-bold transition-colors',
                surfaceAt != null
                  ? 'border-ocean/40 bg-accent text-ocean'
                  : 'border-border text-muted-foreground hover:bg-accent',
                memo?.pinned && 'opacity-40',
              )}
            >
              <Hourglass className="size-3.5" />
              Bottle
            </button>
          </Tip>
        )}

        {isEdit || isComment ? null : (
          <TemplatesMenu
            hasContent={hasContent}
            getMarkdown={() => editorRef.current?.getMarkdown() ?? ''}
            onApply={(content) => {
              const current = editorRef.current?.getMarkdown().trim() ?? '';
              const next = current ? `${current.replace(/\s+$/, '')}\n\n${content}` : content;
              editorRef.current?.setMarkdown(next);
              editorRef.current?.focus();
              setHasContent(true);
            }}
          />
        )}

        <BottleDialog
          open={bottleOpen}
          onOpenChange={setBottleOpen}
          surfaceAt={surfaceAt}
          onSeal={setSurfaceAt}
          onClear={() => setSurfaceAt(null)}
        />

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
