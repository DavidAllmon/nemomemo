import {
  FilterParseError,
  SHARE_EXPIRY_PRESETS,
  createCommentRequestSchema,
  createMemoRequestSchema,
  createShareRequestSchema,
  reactionRequestSchema,
  updateMemoRequestSchema,
  type MemoListResponse,
  type ShareDto,
} from '@nemomemo/shared';
import { zValidator } from '@hono/zod-validator';
import type { Archiver, ArchiverOptions } from 'archiver';
import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { customAlphabet } from 'nanoid';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import {
  memoRelations,
  memoShares,
  memos,
  reactions,
  type MemoRow,
} from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { nextPageToken, parsePageParams } from '../lib/pagination.js';
import { nowSeconds } from '../lib/time.js';
import { requireViewer, type AppEnv } from '../middleware/auth.js';
import { checkMemoRead } from '../services/acl.js';
import { buildMarkdownExport } from '../services/export-service.js';
import { notifyComment, notifyMentions, notifyThreadParticipants } from '../services/inbox-service.js';
import {
  assertDoryRules,
  buildMemoDtos,
  buildPayload,
  getMemoByUid,
  getParentMemo,
  linkAttachments,
  listMemoRows,
  newUid,
  setReferenceRelations,
} from '../services/memo-service.js';
import { getInstanceGeneral, getInstanceMemoSetting } from '../services/settings.js';

// archiver is CJS; createRequire sidesteps default-import interop differences
// between node (tsx/tsup) and vitest's vite-node transform.
const require_ = createRequire(import.meta.url);
const archiver = require_('archiver') as (format: 'zip', options?: ArchiverOptions) => Archiver;

const newShareToken = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  22,
);

export function memoRoutes(db: Db, config: Config): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const allowAnonymous = () => getInstanceGeneral(db).publicMode;

  /** Load a memo by uid and assert the viewer may read it. */
  const readableMemo = (c: Context<AppEnv>, uid: string): MemoRow => {
    const memo = getMemoByUid(db, uid);
    if (!memo) throw apiError('NOT_FOUND', 'This memo swam away');
    const parent = getParentMemo(db, memo.id);
    const denial = checkMemoRead(memo, parent, c.get('viewer'), {
      allowAnonymous: allowAnonymous(),
    });
    if (denial === 'UNAUTHENTICATED') throw apiError('UNAUTHENTICATED', 'Sign in to see this memo');
    if (denial === 'NOT_FOUND') throw apiError('NOT_FOUND', 'This memo swam away');
    return memo;
  };

  const ownedMemo = (c: Context<AppEnv>, uid: string): MemoRow => {
    const viewer = requireViewer(c);
    const memo = getMemoByUid(db, uid);
    if (!memo) throw apiError('NOT_FOUND', 'This memo swam away');
    if (memo.creatorId !== viewer.id && viewer.role !== 'ADMIN') {
      throw apiError('FORBIDDEN', 'Only the author can do that');
    }
    return memo;
  };

  // ---------- List ----------
  app.get('/', (c) => {
    const query = c.req.query();
    const { limit, offset } = parsePageParams(query);
    const scope = (['home', 'explore', 'profile'] as const).find((s) => s === query.scope) ?? 'home';
    const state = query.state === 'ARCHIVED' ? 'ARCHIVED' : 'NORMAL';
    const orderBy = query.orderBy === 'updated_ts' ? 'updated_ts' : 'created_ts';
    const direction = query.dir === 'asc' ? 'ASC' : 'DESC';

    try {
      const { rows, hasMore } = listMemoRows(db, {
        viewer: c.get('viewer'),
        allowAnonymous: allowAnonymous(),
        state,
        scope,
        creatorUsername: query.creator || undefined,
        filterExpression: query.filter || undefined,
        orderBy,
        direction,
        pinnedFirst: scope !== 'explore' && state === 'NORMAL',
        limit,
        offset,
      });
      const response: MemoListResponse = {
        memos: buildMemoDtos(db, rows, c.get('viewer')),
        nextPageToken: nextPageToken(offset, limit, hasMore),
      };
      return c.json(response);
    } catch (error) {
      if (error instanceof FilterParseError) {
        throw apiError('INVALID_ARGUMENT', `Invalid filter: ${error.message}`);
      }
      throw error;
    }
  });

  // ---------- Export ----------
  // A human-readable copy of the viewer's own memos: markdown + attachments.
  app.get('/export/markdown', (c) => {
    const viewer = requireViewer(c);
    const { documents, files } = buildMarkdownExport(db, config, viewer);

    const archive = archiver('zip', { zlib: { level: 6 } });
    for (const doc of documents) archive.append(doc.markdown, { name: doc.path });
    for (const file of files) archive.file(file.absolutePath, { name: file.path });
    void archive.finalize();

    const date = new Date().toISOString().slice(0, 10);
    return new Response(Readable.toWeb(archive) as ReadableStream, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="nemomemo-memos-${viewer.username}-${date}.zip"`,
        'cache-control': 'no-store',
      },
    });
  });

  // ---------- Create ----------
  app.post('/', zValidator('json', createMemoRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const body = c.req.valid('json');
    const memoSetting = getInstanceMemoSetting(db);
    if (Buffer.byteLength(body.content, 'utf8') > memoSetting.contentLengthLimit) {
      throw apiError('INVALID_ARGUMENT', 'Memo content is too long');
    }
    const { payload, mentions } = buildPayload(body.content);
    const now = nowSeconds();
    const forgetAt = body.dory ? now + config.doryTtlSeconds : null;

    const created = db
      .insert(memos)
      .values({
        uid: newUid(),
        creatorId: viewer.id,
        content: body.content,
        visibility: body.visibility ?? 'PRIVATE',
        payload,
        forgetAt,
      })
      .returning()
      .get();

    if (body.attachmentUids?.length) linkAttachments(db, created.id, viewer.id, body.attachmentUids);
    if (body.relatedMemoUids?.length) setReferenceRelations(db, created.id, body.relatedMemoUids, viewer);
    notifyMentions(db, viewer, created, mentions);

    return c.json({ memo: buildMemoDtos(db, [created], viewer)[0] }, 201);
  });

  // ---------- Read ----------
  app.get('/:uid', (c) => {
    const memo = readableMemo(c, c.req.param('uid'));
    return c.json({ memo: buildMemoDtos(db, [memo], c.get('viewer'))[0] });
  });

  // ---------- Update ----------
  app.patch('/:uid', zValidator('json', updateMemoRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const memo = ownedMemo(c, c.req.param('uid'));
    const body = c.req.valid('json');
    // Admins may moderate (archive/restore) but never rewrite someone's words:
    // only the creator can touch content, visibility, dory, pins, or links.
    const editing =
      body.content != null ||
      body.visibility != null ||
      body.dory != null ||
      body.pinned != null ||
      body.attachmentUids != null ||
      body.relatedMemoUids != null;
    if (editing && memo.creatorId !== viewer.id) {
      throw apiError('FORBIDDEN', 'Only the author can edit this memo');
    }
    const now = nowSeconds();

    const patch: Partial<MemoRow> = {};
    let mentionsToNotify: string[] = [];

    if (body.content != null && body.content !== memo.content) {
      const memoSetting = getInstanceMemoSetting(db);
      if (Buffer.byteLength(body.content, 'utf8') > memoSetting.contentLengthLimit) {
        throw apiError('INVALID_ARGUMENT', 'Memo content is too long');
      }
      const before = buildPayload(memo.content);
      const after = buildPayload(body.content);
      patch.content = body.content;
      patch.payload = after.payload;
      // updatedTs means "words last changed" — pins/archives/visibility don't
      // count, so the "edited" badge only appears for real edits.
      patch.updatedTs = now;
      mentionsToNotify = after.mentions.filter((name) => !before.mentions.includes(name));
    }
    if (body.visibility != null) patch.visibility = body.visibility;
    if (body.rowStatus != null) {
      patch.rowStatus = body.rowStatus;
      // Archiving rescues a memo from Dory: archive means "keep".
      if (body.rowStatus === 'ARCHIVED' && memo.forgetAt != null) patch.forgetAt = null;
    }
    if (body.dory != null) {
      if (getParentMemo(db, memo.id)) {
        throw apiError('INVALID_ARGUMENT', "Comments can't be Dory memos — they live and die with their parent");
      }
      patch.forgetAt = body.dory ? now + config.doryTtlSeconds : null;
    }
    if (body.pinned != null) patch.pinned = body.pinned;

    const nextPinned = patch.pinned ?? memo.pinned;
    const nextForgetAt = 'forgetAt' in patch ? (patch.forgetAt ?? null) : memo.forgetAt;
    assertDoryRules(nextPinned, nextForgetAt);

    const updated =
      Object.keys(patch).length > 0
        ? db.update(memos).set(patch).where(eq(memos.id, memo.id)).returning().get()
        : memo;

    if (body.attachmentUids != null) linkAttachments(db, memo.id, memo.creatorId, body.attachmentUids);
    if (body.relatedMemoUids != null) setReferenceRelations(db, memo.id, body.relatedMemoUids, viewer);
    if (mentionsToNotify.length > 0) notifyMentions(db, viewer, updated, mentionsToNotify);

    return c.json({ memo: buildMemoDtos(db, [updated], viewer)[0] });
  });

  // ---------- Delete ----------
  app.delete('/:uid', (c) => {
    const memo = ownedMemo(c, c.req.param('uid'));
    // Also delete comment memos hanging off this one (their relation rows cascade,
    // but the comment memo itself would be orphaned).
    const commentRelations = db
      .select()
      .from(memoRelations)
      .where(and(eq(memoRelations.relatedMemoId, memo.id), eq(memoRelations.type, 'COMMENT')))
      .all();
    db.delete(memos).where(eq(memos.id, memo.id)).run();
    for (const relation of commentRelations) {
      db.delete(memos).where(eq(memos.id, relation.memoId)).run();
    }
    return c.json({ ok: true });
  });

  // ---------- Comments ----------
  app.get('/:uid/comments', (c) => {
    const memo = readableMemo(c, c.req.param('uid'));
    const relations = db
      .select()
      .from(memoRelations)
      .where(and(eq(memoRelations.relatedMemoId, memo.id), eq(memoRelations.type, 'COMMENT')))
      .all();
    const commentIds = relations.map((r) => r.memoId);
    const rows =
      commentIds.length > 0
        ? db
            .select()
            .from(memos)
            .where(
              and(
                eq(memos.rowStatus, 'NORMAL'),
                inArray(memos.id, commentIds),
                or(isNull(memos.forgetAt), gt(memos.forgetAt, nowSeconds())),
              ),
            )
            .orderBy(asc(memos.createdTs), asc(memos.id))
            .all()
        : [];
    return c.json({ memos: buildMemoDtos(db, rows, c.get('viewer')) });
  });

  app.post('/:uid/comments', zValidator('json', createCommentRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const parent = readableMemo(c, c.req.param('uid'));
    if (getParentMemo(db, parent.id)) {
      throw apiError('INVALID_ARGUMENT', 'Comments on comments are not supported');
    }
    const body = c.req.valid('json');
    const { payload, mentions } = buildPayload(body.content);
    const created = db
      .insert(memos)
      .values({
        uid: newUid(),
        creatorId: viewer.id,
        content: body.content,
        visibility: parent.visibility,
        payload,
      })
      .returning()
      .get();
    db.insert(memoRelations)
      .values({ memoId: created.id, relatedMemoId: parent.id, type: 'COMMENT' })
      .run();
    notifyComment(db, viewer, parent, created);
    notifyMentions(db, viewer, created, mentions);
    notifyThreadParticipants(db, viewer, parent, created, mentions);
    return c.json({ memo: buildMemoDtos(db, [created], viewer)[0] }, 201);
  });

  // ---------- Reactions ----------
  app.post('/:uid/reactions', zValidator('json', reactionRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const memo = readableMemo(c, c.req.param('uid'));
    const body = c.req.valid('json');
    const allowed = getInstanceMemoSetting(db).reactions;
    if (!allowed.includes(body.emoji)) {
      throw apiError('INVALID_ARGUMENT', 'That reaction is not enabled on this reef');
    }
    db.insert(reactions)
      .values({ creatorId: viewer.id, memoId: memo.id, emoji: body.emoji })
      .onConflictDoNothing()
      .run();
    return c.json({ memo: buildMemoDtos(db, [memo], viewer)[0] });
  });

  app.delete('/:uid/reactions/:emoji', (c) => {
    const viewer = requireViewer(c);
    const memo = readableMemo(c, c.req.param('uid'));
    db.delete(reactions)
      .where(
        and(
          eq(reactions.creatorId, viewer.id),
          eq(reactions.memoId, memo.id),
          eq(reactions.emoji, c.req.param('emoji')),
        ),
      )
      .run();
    return c.json({ memo: buildMemoDtos(db, [memo], viewer)[0] });
  });

  // ---------- Share links ----------
  app.post('/:uid/shares', zValidator('json', createShareRequestSchema), (c) => {
    const memo = ownedMemo(c, c.req.param('uid'));
    const viewer = requireViewer(c);
    const preset = SHARE_EXPIRY_PRESETS[c.req.valid('json').expiresIn];
    const share = db
      .insert(memoShares)
      .values({
        uid: newShareToken(),
        memoId: memo.id,
        creatorId: viewer.id,
        expiresTs: preset == null ? null : nowSeconds() + preset,
      })
      .returning()
      .get();
    const dto: ShareDto = { token: share.uid, createdTs: share.createdTs, expiresTs: share.expiresTs };
    return c.json({ share: dto }, 201);
  });

  app.get('/:uid/shares', (c) => {
    const memo = ownedMemo(c, c.req.param('uid'));
    const now = nowSeconds();
    const rows = db.select().from(memoShares).where(eq(memoShares.memoId, memo.id)).all();
    const shares: ShareDto[] = rows
      .filter((row) => row.expiresTs == null || row.expiresTs > now)
      .map((row) => ({ token: row.uid, createdTs: row.createdTs, expiresTs: row.expiresTs }));
    return c.json({ shares });
  });

  return app;
}
