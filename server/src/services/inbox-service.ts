import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { inboxes, memoRelations, memos, users, type MemoRow, type UserRow } from '../db/schema.js';

/**
 * Notify @mentioned users (skipping self-mentions and unknown usernames).
 * A mention in a PRIVATE memo notifies nobody — the mentioned user couldn't
 * read the memo, so even a notification would leak that it exists.
 */
export function notifyMentions(db: Db, sender: UserRow, memo: MemoRow, mentions: string[]): void {
  if (mentions.length === 0 || memo.visibility === 'PRIVATE') return;
  const mentioned = db.select().from(users).where(inArray(users.username, mentions)).all();
  for (const user of mentioned) {
    if (user.id === sender.id || user.rowStatus !== 'NORMAL') continue;
    db.insert(inboxes)
      .values({ senderId: sender.id, receiverId: user.id, type: 'MEMO_MENTION', memoId: memo.id })
      .run();
  }
}

/**
 * Notify everyone who commented earlier on this thread that it continued
 * (thread subscription). Skips the reply's author, the parent's owner (they get
 * a MEMO_COMMENT), anyone @mentioned in the reply (they get a MEMO_MENTION),
 * and archived users. PRIVATE parents notify nobody — same rule as mentions.
 */
export function notifyThreadParticipants(
  db: Db,
  sender: UserRow,
  parentMemo: MemoRow,
  commentMemo: MemoRow,
  mentionedUsernames: string[],
): void {
  if (parentMemo.visibility === 'PRIVATE') return;
  const priorCommenterIds = new Set(
    db
      .select({ creatorId: memos.creatorId })
      .from(memoRelations)
      .innerJoin(memos, eq(memos.id, memoRelations.memoId))
      .where(and(eq(memoRelations.relatedMemoId, parentMemo.id), eq(memoRelations.type, 'COMMENT')))
      .all()
      .map((row) => row.creatorId),
  );
  priorCommenterIds.delete(sender.id);
  priorCommenterIds.delete(parentMemo.creatorId);
  priorCommenterIds.delete(commentMemo.creatorId);
  if (priorCommenterIds.size === 0) return;

  const recipients = db.select().from(users).where(inArray(users.id, [...priorCommenterIds])).all();
  const mentioned = new Set(mentionedUsernames);
  for (const user of recipients) {
    if (user.rowStatus !== 'NORMAL' || mentioned.has(user.username)) continue;
    db.insert(inboxes)
      .values({ senderId: sender.id, receiverId: user.id, type: 'MEMO_THREAD', memoId: commentMemo.id })
      .run();
  }
}

/** Notify a memo's owner that someone commented (linking to the comment memo). */
export function notifyComment(db: Db, sender: UserRow, parentMemo: MemoRow, commentMemo: MemoRow): void {
  if (parentMemo.creatorId === sender.id) return;
  const owner = db.select().from(users).where(eq(users.id, parentMemo.creatorId)).get();
  if (!owner || owner.rowStatus !== 'NORMAL') return;
  db.insert(inboxes)
    .values({
      senderId: sender.id,
      receiverId: owner.id,
      type: 'MEMO_COMMENT',
      memoId: commentMemo.id,
    })
    .run();
}
