import type { MemoRow, UserRow } from '../db/schema.js';

export interface AclContext {
  /** Instance public mode: anonymous visitors may read PUBLIC memos. */
  allowAnonymous: boolean;
  /** When access arrives through a share token, the memo id that token names. */
  sharedMemoId?: number;
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
