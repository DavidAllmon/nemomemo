import { Check, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { MemoDto } from '@nemomemo/shared';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent } from '@/components/ui/overlays.js';
import { useCreateShare, useRevokeShare, useShares } from '@/hooks/queries.js';
import { absoluteTime } from '@/lib/utils.js';

const EXPIRY_OPTIONS = [
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never' },
] as const;

export function ShareDialog({
  memo,
  open,
  onOpenChange,
}: {
  memo: MemoDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: shares } = useShares(memo.uid, open);
  const createShare = useCreateShare(memo.uid);
  const revokeShare = useRevokeShare(memo.uid);
  const [expiresIn, setExpiresIn] = useState<string>('7d');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const copy = (token: string) => {
    void navigator.clipboard.writeText(`${location.origin}/memos/shares/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Share this memo"
        description="Anyone with a link can read the memo — no account needed."
      >
        {memo.forgetAt != null ? (
          <p className="mb-3 rounded-xl bg-dory-soft px-3 py-2 text-xs font-semibold text-dory">
            This is a Dory memo — links stop working when she forgets it.
          </p>
        ) : null}

        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="share-expiry">
            Link expires
          </label>
          <select
            id="share-expiry"
            value={expiresIn}
            onChange={(event) => setExpiresIn(event.target.value)}
            className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            className="ml-auto"
            disabled={createShare.isPending}
            onClick={() =>
              createShare.mutate(expiresIn, { onSuccess: ({ share }) => copy(share.token) })
            }
          >
            Create link
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {(shares ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No share links yet — create one above.</p>
          ) : (
            shares!.map((share) => (
              <div
                key={share.token}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">…/memos/shares/{share.token}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {share.expiresTs ? `Expires ${absoluteTime(share.expiresTs)}` : 'Never expires'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Copy link" onClick={() => copy(share.token)}>
                  {copiedToken === share.token ? (
                    <Check className="size-4 text-ocean" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Revoke link"
                  onClick={() => revokeShare.mutate(share.token)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
