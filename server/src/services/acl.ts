import type { MemoRow, UserRow } from '../db/schema.js';

export interface AclContext {
  /** Instance public mode: anonymous visitors may read PUBLIC memos. */
  allowAnonymous: boolean;
  /** When access arrives through a share token, the memo id that token names. */
  sharedMemoId?: number;
  /** Injectable clock (epoch seconds) for tests; defaults to now. */
  nowEpoch?: number;
}

export type MemoReadDenial = 'NOT_FOUND' | 'UNAUTHENTICATED' | null;

/**
 * Single access-control decision for reading a memo, used by both the JSON API
 * and the raw file server (an attachment can never out-scope its memo).
 * Comments derive visibility from their parent, so pass the parent when the
 * memo is a comment.
 */
export function checkMemoRead(
  memo: MemoRow,
  parent: MemoRow | null,
  viewer: UserRow | null,
  ctx: AclContext,
): MemoReadDenial {
  const effective = parent ?? memo;

  // Dory: an expired memo is gone the instant its time is up, even if the
  // sweeper hasn't run yet — and a comment dies with its expired parent.
  // Not even a share token resurrects it.
  const now = ctx.nowEpoch ?? Math.floor(Date.now() / 1000);
  if (
    (memo.forgetAt != null && memo.forgetAt <= now) ||
    (effective.forgetAt != null && effective.forgetAt <= now)
  ) {
    return 'NOT_FOUND';
  }

  // A share token grants access to exactly the memo it names (and, for
  // attachments, that memo's files) regardless of visibility.
  if (ctx.sharedMemoId != null && (memo.id === ctx.sharedMemoId || effective.id === ctx.sharedMemoId)) {
    return null;
  }

  // Archived memos are visible only to their creator.
  if (effective.rowStatus === 'ARCHIVED' || memo.rowStatus === 'ARCHIVED') {
    return viewer?.id === memo.creatorId ? null : 'NOT_FOUND';
  }

  switch (effective.visibility) {
    case 'PRIVATE':
      return viewer?.id === effective.creatorId ? null : 'NOT_FOUND';
    case 'PROTECTED':
      return viewer ? null : 'UNAUTHENTICATED';
    case 'PUBLIC':
      if (viewer) return null;
      return ctx.allowAnonymous ? null : 'UNAUTHENTICATED';
  }
}

/**
 * May this viewer see another memo *embedded* in something they're reading —
 * a relation stub, an inbox snippet? Same rules as checkMemoRead, minus the
 * share-token special case.
 */
export function canGlimpseMemo(memo: MemoRow, viewer: UserRow | null, nowEpoch?: number): boolean {
  const now = nowEpoch ?? Math.floor(Date.now() / 1000);
  if (memo.forgetAt != null && memo.forgetAt <= now) return false;
  if (memo.rowStatus === 'ARCHIVED') return viewer?.id === memo.creatorId;
  switch (memo.visibility) {
    case 'PRIVATE':
      return viewer?.id === memo.creatorId;
    case 'PROTECTED':
      return viewer != null;
    case 'PUBLIC':
      return true;
  }
}
