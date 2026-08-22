import {
  extractProps,
  type AttachmentDto,
  type MemoDto,
  type MemoPropertyDto,
  type ReactionDto,
  type RelatedMemoStubDto,
  type UserDto,
  type Visibility,
} from '@nemomemo/shared';
import { and, eq, inArray, or } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import type { Db } from '../db/index.js';
import {
  attachments,
  memoRelations,
  memos,
  reactions,
  users,
  type MemoRow,
  type UserRow,
} from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { nowSeconds } from '../lib/time.js';
import { canGlimpseMemo } from './acl.js';
import { compileFilterExpression } from './filter-sql.js';

export const newUid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

export function userToDto(user: UserRow, opts: { includeEmail?: boolean } = {}): UserDto {
  return {
    username: user.username,
    nickname: user.nickname || user.username,
    role: user.role,
    avatarUrl: user.avatarUrl,
    description: user.description,
    rowStatus: user.rowStatus,
    createdTs: user.createdTs,
    ...(opts.includeEmail ? { email: user.email } : {}),
  };
}

export function snippet(content: string, length = 64): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= length) return plain;
  const cut = plain.slice(0, length);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > length / 2 ? cut.slice(0, lastSpace) : cut) + ' ...';
}

interface MemoPayload {
  tags?: string[];
  property?: Partial<MemoPropertyDto>;
}

export function parsePayload(payload: string): MemoPayload {
  try {
    return JSON.parse(payload) as MemoPayload;
  } catch {
    return {};
  }
}

export function buildPayload(content: string): { payload: string; mentions: string[] } {
  const extracted = extractProps(content);
  return {
    payload: JSON.stringify({ tags: extracted.tags, property: extracted.property }),
    mentions: extracted.mentions,
  };
}

// ---------- DTO assembly (batch, no N+1) ----------

export function buildMemoDtos(db: Db, rows: MemoRow[], viewer: UserRow | null): MemoDto[] {
  if (rows.length === 0) return [];
  const memoIds = rows.map((row) => row.id);

  const creatorIds = [...new Set(rows.map((row) => row.creatorId))];
  const creators = new Map(
    db.select().from(users).where(inArray(users.id, creatorIds)).all().map((u) => [u.id, u]),
  );

  const attachmentRows = db.select().from(attachments).where(inArray(attachments.memoId, memoIds)).all();
  const attachmentsByMemo = new Map<number, AttachmentDto[]>();
  const uidById = new Map(rows.map((row) => [row.id, row.uid]));
  for (const row of attachmentRows) {
    const list = attachmentsByMemo.get(row.memoId!) ?? [];
    list.push({
      uid: row.uid,
      filename: row.filename,
      type: row.type,
      size: row.size,
      createdTs: row.createdTs,
      memoUid: uidById.get(row.memoId!) ?? null,
    });
    attachmentsByMemo.set(row.memoId!, list);
  }

  const reactionRows = db.select().from(reactions).where(inArray(reactions.memoId, memoIds)).all();
  const reactionsByMemo = new Map<number, ReactionDto[]>();
  for (const row of reactionRows) {
    const list = reactionsByMemo.get(row.memoId) ?? [];
    const existing = list.find((r) => r.emoji === row.emoji);
    if (existing) {
      existing.count++;
      if (viewer && row.creatorId === viewer.id) existing.reactedByViewer = true;
    } else {
      list.push({
        emoji: row.emoji,
        count: 1,
        reactedByViewer: viewer != null && row.creatorId === viewer.id,
      });
    }
    reactionsByMemo.set(row.memoId, list);
  }

  // Relations: outgoing REFERENCE (referencing), incoming REFERENCE (referenced by),
  // incoming COMMENT (comment count), outgoing COMMENT (parent).
  const allRelations = db
    .select()
    .from(memoRelations)
    .where(or(inArray(memoRelations.memoId, memoIds), inArray(memoRelations.relatedMemoId, memoIds)))
    .all();

  const relatedIds = new Set<number>();
  for (const rel of allRelations) {
    relatedIds.add(rel.memoId);
    relatedIds.add(rel.relatedMemoId);
  }
  const relatedMemoRows =
    relatedIds.size > 0
      ? db.select().from(memos).where(inArray(memos.id, [...relatedIds])).all()
      : [];
  const relatedById = new Map(relatedMemoRows.map((m) => [m.id, m]));
  const relatedCreatorIds = [...new Set(relatedMemoRows.map((m) => m.creatorId))];
  const relatedCreators =
    relatedCreatorIds.length > 0
      ? new Map(
          db.select().from(users).where(inArray(users.id, relatedCreatorIds)).all().map((u) => [u.id, u]),
        )
      : new Map<number, UserRow>();

  // Relation stubs go through the same visibility rules as reading the memo —
  // a reference must never become a window into content the viewer can't open.
  const now = nowSeconds();
  const stub = (memoId: number): RelatedMemoStubDto | null => {
    const memo = relatedById.get(memoId);
    if (!memo || !canGlimpseMemo(memo, viewer, now)) return null;
    const creator = relatedCreators.get(memo.creatorId);
    return {
      uid: memo.uid,
      creator: creator?.username ?? 'unknown',
      snippet: snippet(memo.content),
    };
  };

  return rows.map((row) => {
    const payload = parsePayload(row.payload);
    const creator = creators.get(row.creatorId);
    const referencing = allRelations
      .filter((r) => r.memoId === row.id && r.type === 'REFERENCE')
      .map((r) => stub(r.relatedMemoId))
      .filter((s): s is RelatedMemoStubDto => s != null);
    const referencedBy = allRelations
      .filter((r) => r.relatedMemoId === row.id && r.type === 'REFERENCE')
      .map((r) => stub(r.memoId))
      .filter((s): s is RelatedMemoStubDto => s != null);
    const commentCount = allRelations.filter(
      (r) => r.relatedMemoId === row.id && r.type === 'COMMENT',
    ).length;
    const parentRelation = allRelations.find((r) => r.memoId === row.id && r.type === 'COMMENT');
    const parentUid = parentRelation ? (relatedById.get(parentRelation.relatedMemoId)?.uid ?? null) : null;

    return {
      uid: row.uid,
      creator: creator ? userToDto(creator) : userToDto(placeholderUser()),
      createdTs: row.createdTs,
      updatedTs: row.updatedTs,
      rowStatus: row.rowStatus,
      content: row.content,
      visibility: row.visibility,
      pinned: row.pinned,
      tags: payload.tags ?? [],
      property: {
        hasLink: payload.property?.hasLink ?? false,
        hasCode: payload.property?.hasCode ?? false,
        hasTaskList: payload.property?.hasTaskList ?? false,
        hasIncompleteTasks: payload.property?.hasIncompleteTasks ?? false,
      },
      attachments: attachmentsByMemo.get(row.id) ?? [],
      reactions: reactionsByMemo.get(row.id) ?? [],
      commentCount,
      forgetAt: row.forgetAt,
      parentUid,
      referencing,
      referencedBy,
    };
  });
}

function placeholderUser(): UserRow {
  return {
    id: 0,
    createdTs: 0,
    updatedTs: 0,
    rowStatus: 'NORMAL',
    username: 'unknown',
    role: 'USER',
    email: '',
    nickname: 'Unknown',
    passwordHash: '',
    avatarUrl: '',
    description: '',
  };
}

// ---------- Listing ----------

export interface ListMemosOptions {
  viewer: UserRow | null;
  allowAnonymous: boolean;
  state: 'NORMAL' | 'ARCHIVED';
  /** 'home' = viewer's own memos; 'explore' = shared feed; 'profile' = one user's memos. */
  scope: 'home' | 'explore' | 'profile';
  creatorUsername?: string;
  filterExpression?: string;
  orderBy: 'created_ts' | 'updated_ts';
  direction: 'ASC' | 'DESC';
  pinnedFirst: boolean;
  limit: number;
  offset: number;
  includeComments?: boolean;
}

export function listMemoRows(db: Db, opts: ListMemosOptions): { rows: MemoRow[]; hasMore: boolean } {
  const now = nowSeconds();
  const where: string[] = [];
  const params: unknown[] = [];

  // Dory: expired-but-unswept memos never leak.
  where.push('(memo.forget_at IS NULL OR memo.forget_at > ?)');
  params.push(now);

  if (!opts.includeComments) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM memo_relation r WHERE r.memo_id = memo.id AND r.type = 'COMMENT')`,
    );
  }

  where.push('memo.row_status = ?');
  params.push(opts.state);

  let creatorId: number | null = null;
  if (opts.creatorUsername) {
    const creator = db.select().from(users).where(eq(users.username, opts.creatorUsername)).get();
    if (!creator) return { rows: [], hasMore: false };
    creatorId = creator.id;
  }

  if (opts.state === 'ARCHIVED') {
    // Archived memos are always creator-only.
    if (!opts.viewer) return { rows: [], hasMore: false };
    where.push('memo.creator_id = ?');
    params.push(opts.viewer.id);
  } else if (opts.scope === 'home') {
    if (!opts.viewer) return { rows: [], hasMore: false };
    where.push('memo.creator_id = ?');
    params.push(opts.viewer.id);
  } else if (opts.scope === 'explore') {
    if (opts.viewer) {
      where.push(`memo.visibility IN ('PUBLIC','PROTECTED')`);
    } else {
      if (!opts.allowAnonymous) return { rows: [], hasMore: false };
      where.push(`memo.visibility = 'PUBLIC'`);
    }
  } else {
    // profile
    if (creatorId == null) return { rows: [], hasMore: false };
    where.push('memo.creator_id = ?');
    params.push(creatorId);
    if (opts.viewer?.id !== creatorId) {
      if (opts.viewer) {
        where.push(`memo.visibility IN ('PUBLIC','PROTECTED')`);
      } else {
        if (!opts.allowAnonymous) return { rows: [], hasMore: false };
        where.push(`memo.visibility = 'PUBLIC'`);
      }
    }
  }

  if (opts.scope !== 'profile' && creatorId != null) {
    where.push('memo.creator_id = ?');
    params.push(creatorId);
  }

  if (opts.filterExpression) {
    const compiled = compileFilterExpression(opts.filterExpression, now);
    where.push(compiled.sql);
    params.push(...compiled.params);
  }

  const order = [
    ...(opts.pinnedFirst ? ['memo.pinned DESC'] : []),
    `memo.${opts.orderBy} ${opts.direction}`,
    'memo.id DESC',
  ].join(', ');

  const sql = `SELECT memo.* FROM memo WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`;
  params.push(opts.limit + 1, opts.offset);

  const raw = db.$client.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
  const rows = raw.map(rawToMemoRow);
  const hasMore = rows.length > opts.limit;
  return { rows: rows.slice(0, opts.limit), hasMore };
}

function rawToMemoRow(raw: Record<string, unknown>): MemoRow {
  return {
    id: raw.id as number,
    uid: raw.uid as string,
    creatorId: raw.creator_id as number,
    createdTs: raw.created_ts as number,
    updatedTs: raw.updated_ts as number,
    rowStatus: raw.row_status as MemoRow['rowStatus'],
    content: raw.content as string,
    visibility: raw.visibility as Visibility,
    pinned: (raw.pinned as number) === 1,
    payload: raw.payload as string,
    forgetAt: (raw.forget_at as number | null) ?? null,
  };
}

// ---------- Lookup helpers ----------

export function getMemoByUid(db: Db, uid: string): MemoRow | null {
  const memo = db.select().from(memos).where(eq(memos.uid, uid)).get() ?? null;
  if (memo?.forgetAt != null && memo.forgetAt <= nowSeconds()) return null;
  return memo;
}

export function getParentMemo(db: Db, memoId: number): MemoRow | null {
  const relation = db
    .select()
    .from(memoRelations)
    .where(and(eq(memoRelations.memoId, memoId), eq(memoRelations.type, 'COMMENT')))
    .get();
  if (!relation) return null;
  return db.select().from(memos).where(eq(memos.id, relation.relatedMemoId)).get() ?? null;
}

export function linkAttachments(db: Db, memoId: number, creatorId: number, attachmentUids: string[]): void {
  // Replace-all semantics, like memos' SetMemoAttachments.
  db.update(attachments).set({ memoId: null }).where(eq(attachments.memoId, memoId)).run();
  if (attachmentUids.length > 0) {
    db.update(attachments)
      .set({ memoId })
      .where(and(inArray(attachments.uid, attachmentUids), eq(attachments.creatorId, creatorId)))
      .run();
  }
}

export function setReferenceRelations(db: Db, memoId: number, relatedUids: string[], actor: UserRow): void {
  db.delete(memoRelations)
    .where(and(eq(memoRelations.memoId, memoId), eq(memoRelations.type, 'REFERENCE')))
    .run();
  for (const uid of relatedUids) {
    const target = db.select().from(memos).where(eq(memos.uid, uid)).get();
    // You can only link to memos you can actually read — otherwise a
    // reference would leak the target's content through its stub.
    if (target && target.id !== memoId && canGlimpseMemo(target, actor)) {
      db.insert(memoRelations)
        .values({ memoId, relatedMemoId: target.id, type: 'REFERENCE' })
        .onConflictDoNothing()
        .run();
    }
  }
}

export function assertDoryRules(pinned: boolean, forgetAt: number | null): void {
  if (pinned && forgetAt != null) {
    throw apiError(
      'INVALID_ARGUMENT',
      "A memo can't be pinned and a Dory memo at once — Dory would forget something important!",
    );
  }
}
