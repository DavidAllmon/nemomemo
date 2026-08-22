import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { inboxes, users, type MemoRow, type UserRow } from '../db/schema.js';

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
