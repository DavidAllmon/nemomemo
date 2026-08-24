import { LayoutTemplate, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/misc.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tip,
} from '@/components/ui/overlays.js';
import { useUpdateUserSettings, useUserSettings } from '@/hooks/queries.js';
import { applyTemplate, BUILT_IN_TEMPLATES } from '@/lib/templates.js';

export function TemplatesMenu({
  hasContent,
  getMarkdown,
  onApply,
}: {
  /** Whether the editor currently holds words — gates "Save as template…". */
  hasContent: boolean;
  getMarkdown: () => string;
  onApply: (content: string) => void;
}) {
  const { data: settings } = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const custom = settings?.memoTemplates ?? [];

  const saveCurrent = () => {
    const title = saveName.trim();
    const content = getMarkdown().trim();
    if (!title || !content) return;
    updateSettings.mutate({
      memoTemplates: [...custom, { id: crypto.randomUUID(), title, content }],
    });
    setSaveOpen(false);
    setSaveName('');
  };

  const removeTemplate = (id: string) => {
    updateSettings.mutate({ memoTemplates: custom.filter((t) => t.id !== id) });
  };

  return (
    <>
      <DropdownMenu>
        <Tip label="Start from a template">
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Templates"
              className="flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent"
            >
              <LayoutTemplate className="size-3.5" />
              Template
            </button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="start" className="w-60">
          {custom.map((template) => (
            <DropdownMenuItem key={template.id} onSelect={() => onApply(applyTemplate(template.content))}>
              <LayoutTemplate className="size-4 text-ocean" />
              <span className="flex-1 truncate">{template.title}</span>
              <button
                aria-label={`Delete template ${template.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  removeTemplate(template.id);
                }}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          {custom.length > 0 ? <DropdownMenuSeparator /> : null}
          {BUILT_IN_TEMPLATES.map((template) => (
            <DropdownMenuItem key={template.id} onSelect={() => onApply(applyTemplate(template.content))}>
              <LayoutTemplate className="size-4" />
              {template.title}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!hasContent || custom.length >= 20} onSelect={() => setSaveOpen(true)}>
            <Plus className="size-4" /> Save current memo as template…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent
          title="Save as template"
          description="What you've written becomes a one-tap starting point — up to 20 of your own."
        >
          <Input
            autoFocus
            placeholder="Weekly review"
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveCurrent();
            }}
          />
          <div className="mt-3 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={!saveName.trim() || updateSettings.isPending} onClick={saveCurrent}>
              Save template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
