import {
  DORY_WINDOW_SECONDS,
  FilterParseError,
  SHARE_EXPIRY_PRESETS,
  TRASH_RETENTION_SECONDS,
  createCommentRequestSchema,
  createMemoRequestSchema,
  createShareRequestSchema,
  reactionRequestSchema,
  updateMemoRequestSchema,
  type MemoHistoryResponse,
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
import { buildMarkdownExport, markdownFilename, renderMemoMarkdown } from '../services/export-service.js';
import { notifyComment, notifyMentions, notifyThreadParticipants } from '../services/inbox-service.js';
import { purgeMemos } from '../services/purge.js';
import { captureRevision, listRevisions } from '../services/revision-service.js';
import {
  assertTimeRules,
  buildMemoDtos,
  buildMemoListWhere,
  buildPayload,
  getMemoByUid,
  getParentMemo,
  linkAttachments,
  listMemoRows,
  newUid,
  rawToMemoRow,
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

  // ---------- Dory's Memory ----------
  // Everything currently fading (soonest first) + bottles still at sea.
  // Static path: MUST stay registered before '/:uid'.
  app.get('/dory', (c) => {
    const viewer = requireViewer(c);
    const now = nowSeconds();
    const fading = db.$client
      .prepare(
        `SELECT * FROM memo WHERE creator_id = ? AND row_status = 'NORMAL'
         AND forget_at IS NOT NULL AND forget_at > ? ORDER BY forget_at ASC LIMIT 200`,
      )
      .all(viewer.id, now) as Record<string, unknown>[];
    const bottles = db.$client
      .prepare(
        `SELECT * FROM memo WHERE creator_id = ? AND row_status = 'NORMAL'
         AND surface_at IS NOT NULL AND surface_at > ? ORDER BY surface_at ASC LIMIT 200`,
      )
      .all(viewer.id, now) as Record<string, unknown>[];
    return c.json({
      fading: buildMemoDtos(db, fading.map(rawToMemoRow), viewer),
      bottles: buildMemoDtos(db, bottles.map(rawToMemoRow), viewer),
      forgottenCount: viewer.doryForgottenCount,
    });
  });

  // ---------- Trash ----------
  // Deleted memos wait here for TRASH_RETENTION_SECONDS; the scheduler purges
  // them after that. Static paths: MUST stay registered before '/:uid'.
  app.get('/trash', (c) => {
    const viewer = requireViewer(c);
    // Comments ride along with their parent rather than standing as entries.
    const rows = db.$client
      .prepare(
        `SELECT * FROM memo WHERE creator_id = ? AND deleted_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM memo_relation r WHERE r.memo_id = memo.id AND r.type = 'COMMENT'
           )
         ORDER BY deleted_at DESC, id DESC LIMIT 200`,
      )
      .all(viewer.id) as Record<string, unknown>[];
    return c.json({
      memos: buildMemoDtos(db, rows.map(rawToMemoRow), viewer),
      retentionSeconds: TRASH_RETENTION_SECONDS,
    });
  });

  app.post('/trash/empty', (c) => {
    const viewer = requireViewer(c);
    const ids = (
      db.$client
        .prepare('SELECT id FROM memo WHERE creator_id = ? AND deleted_at IS NOT NULL')
        .all(viewer.id) as { id: number }[]
    ).map((row) => row.id);
    return c.json({ purged: purgeMemos(db, config.uploadsDir, ids) });
  });

  // ---------- Go fish ----------
  // One random memo from the viewer's own reef. The WHERE comes from
  // buildMemoListWhere, so a fished memo can never be an expired Dory memo,
  // a bottle still at sea, a comment, or somebody else's.
  // Static path: MUST stay registered before '/:uid'.
  app.get('/random', (c) => {
    const viewer = requireViewer(c);
    const built = buildMemoListWhere(
      db,
      { viewer, allowAnonymous: allowAnonymous(), state: 'NORMAL', scope: 'home' },
      nowSeconds(),
    );
    const raw = built
      ? (db.$client
          .prepare(
            `SELECT memo.* FROM memo WHERE ${built.where.join(' AND ')} ORDER BY RANDOM() LIMIT 1`,
          )
          .get(...(built.params as never[])) as Record<string, unknown> | undefined)
      : undefined;
    if (!raw) throw apiError('NOT_FOUND', 'Nothing to fish for yet — write a memo first');
    return c.json({ memo: buildMemoDtos(db, [rawToMemoRow(raw)], viewer)[0] });
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
    const forgetAt = body.dory
      ? now + (body.doryWindow ? DORY_WINDOW_SECONDS[body.doryWindow] : config.doryTtlSeconds)
      : null;
    const surfaceAt = body.surfaceAt ?? null;
    if (surfaceAt != null && surfaceAt <= now) {
      throw apiError('INVALID_ARGUMENT', "A bottle needs a future date — pick a day that hasn't happened yet.");
    }
    assertTimeRules(false, forgetAt, surfaceAt);

    const created = db
      .insert(memos)
      .values({
        uid: newUid(),
        creatorId: viewer.id,
        content: body.content,
        visibility: body.visibility ?? 'PRIVATE',
        payload,
        forgetAt,
        surfaceAt,
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

  // One memo as a frontmattered .md download — same ACL as reading it.
  app.get('/:uid/markdown', (c) => {
    const memo = readableMemo(c, c.req.param('uid'));
    const parent = getParentMemo(db, memo.id);
    return new Response(renderMemoMarkdown(memo, parent), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${markdownFilename(memo)}"`,
        'cache-control': 'no-store',
      },
    });
  });

  // ---------- Edit history ----------
  // Creator-only, and the memo itself must still be readable — so a trashed,
  // expired, or otherwise hidden memo never leaks the words it used to hold.
  // (Admins moderate; they never read a member's past drafts.)
  const historyMemo = (c: Context<AppEnv>, uid: string): MemoRow => {
    const viewer = requireViewer(c);
    const memo = readableMemo(c, uid);
    if (memo.creatorId !== viewer.id) {
      throw apiError('FORBIDDEN', "Only the author can see this memo's past");
    }
    return memo;
  };

  app.get('/:uid/history', (c) => {
    const memo = historyMemo(c, c.req.param('uid'));
    const response: MemoHistoryResponse = {
      revisions: listRevisions(db, memo.id).map((row) => ({
        id: row.id,
        content: row.content,
        createdTs: row.created_ts,
      })),
    };
    return c.json(response);
  });

  app.post('/:uid/history/:revisionId/restore', (c) => {
    const viewer = requireViewer(c);
    const memo = historyMemo(c, c.req.param('uid'));
    const revision = db.$client
      .prepare('SELECT id, content FROM memo_revision WHERE id = ? AND memo_id = ?')
      .get(Number(c.req.param('revisionId')), memo.id) as { id: number; content: string } | undefined;
    if (!revision) {
      throw apiError('NOT_FOUND', 'That version drifted off — refresh the history and try again');
    }
    // Restoring what's already there would only mint a phantom revision.
    if (revision.content === memo.content) {
      return c.json({ memo: buildMemoDtos(db, [memo], viewer)[0] });
    }
    // The instance limit may have shrunk since this revision was written.
    if (Buffer.byteLength(revision.content, 'utf8') > getInstanceMemoSetting(db).contentLengthLimit) {
      throw apiError('INVALID_ARGUMENT', 'Memo content is too long');
    }
    const now = nowSeconds();
    const { payload } = buildPayload(revision.content);
    const restore = db.$client.transaction(() => {
      captureRevision(db, memo.id, memo.content, now);
      return db
        .update(memos)
        .set({ content: revision.content, payload, updatedTs: now })
        .where(eq(memos.id, memo.id))
        .returning()
        .get();
    });
    return c.json({ memo: buildMemoDtos(db, [restore()], viewer)[0] });
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
      body.doryWindow != null ||
      body.surfaceAt !== undefined ||
      body.remindAt !== undefined ||
      body.remindEvery !== undefined ||
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
      patch.forgetAt = body.dory
        ? now + (body.doryWindow ? DORY_WINDOW_SECONDS[body.doryWindow] : config.doryTtlSeconds)
        : null;
    }
    if (body.surfaceAt !== undefined) {
      if (getParentMemo(db, memo.id)) {
        throw apiError('INVALID_ARGUMENT', "Comments can't be bottles — they live on their parent's shore");
      }
      if (body.surfaceAt != null && body.surfaceAt <= now) {
        throw apiError('INVALID_ARGUMENT', "A bottle needs a future date — pick a day that hasn't happened yet.");
      }
      patch.surfaceAt = body.surfaceAt;
    }
    if (body.remindAt !== undefined) {
      if (body.remindAt != null && body.remindAt <= now) {
        throw apiError('INVALID_ARGUMENT', 'That moment already swam by — pick a future time for the nudge.');
      }
      patch.remindAt = body.remindAt;
      if (body.remindAt == null) patch.remindEvery = null;
    }
    if (body.remindEvery !== undefined) {
      const nextRemindAt = body.remindAt !== undefined ? body.remindAt : memo.remindAt;
      if (body.remindEvery != null && nextRemindAt == null) {
        throw apiError('INVALID_ARGUMENT', 'A repeat needs a first nudge — set a reminder time too.');
      }
      patch.remindEvery = body.remindEvery;
    }
    if (body.pinned != null) patch.pinned = body.pinned;

    const nextPinned = patch.pinned ?? memo.pinned;
    const nextForgetAt = 'forgetAt' in patch ? (patch.forgetAt ?? null) : memo.forgetAt;
    const nextSurfaceAt = 'surfaceAt' in patch ? (patch.surfaceAt ?? null) : memo.surfaceAt;
    assertTimeRules(nextPinned, nextForgetAt, nextSurfaceAt);

    // A content change stores the words it replaces; revision and update
    // commit together or not at all.
    const applyPatch = () => db.update(memos).set(patch).where(eq(memos.id, memo.id)).returning().get();
    const updated =
      Object.keys(patch).length > 0
        ? patch.content != null
          ? db.$client.transaction(() => {
              captureRevision(db, memo.id, memo.content, now);
              return applyPatch();
            })()
          : applyPatch()
        : memo;

    if (body.attachmentUids != null) linkAttachments(db, memo.id, memo.creatorId, body.attachmentUids);
    if (body.relatedMemoUids != null) setReferenceRelations(db, memo.id, body.relatedMemoUids, viewer);
    if (mentionsToNotify.length > 0) notifyMentions(db, viewer, updated, mentionsToNotify);

    return c.json({ memo: buildMemoDtos(db, [updated], viewer)[0] });
  });

  // ---------- Delete ----------
  /** Comment memos hanging off a memo — they travel with it, always. */
  const commentIdsOf = (memoId: number): number[] =>
    db
      .select()
      .from(memoRelations)
      .where(and(eq(memoRelations.relatedMemoId, memoId), eq(memoRelations.type, 'COMMENT')))
      .all()
      .map((relation) => relation.memoId);

  app.delete('/:uid', (c) => {
    const memo = ownedMemo(c, c.req.param('uid'));

    // "Delete forever": straight past the trash, from the trash page or the menu.
    if (c.req.query('permanent') === '1') {
      purgeMemos(db, config.uploadsDir, [memo.id]);
      return c.json({ ok: true, trashed: false });
    }

    // Soft: the memo and its comments go to the creator's trash together. An
    // already-trashed memo keeps its original clock — deleting twice must not
    // extend the stay.
    if (memo.deletedAt == null) {
      const commentIds = commentIdsOf(memo.id);
      const now = nowSeconds();
      const mark = db.$client.transaction(() => {
        const stmt = db.$client.prepare('UPDATE memo SET deleted_at = ? WHERE id = ?');
        stmt.run(now, memo.id);
        for (const id of commentIds) stmt.run(now, id);
      });
      mark();
    }
    return c.json({ ok: true, trashed: true });
  });

  app.post('/:uid/restore', (c) => {
    const memo = ownedMemo(c, c.req.param('uid'));
    if (memo.deletedAt == null) throw apiError('INVALID_ARGUMENT', "That memo isn't in the trash");
    const commentIds = commentIdsOf(memo.id);
    const restore = db.$client.transaction(() => {
      const stmt = db.$client.prepare('UPDATE memo SET deleted_at = NULL WHERE id = ?');
      stmt.run(memo.id);
      for (const id of commentIds) stmt.run(id);
    });
    restore();
    const restored = getMemoByUid(db, memo.uid)!;
    return c.json({ memo: buildMemoDtos(db, [restored], c.get('viewer'))[0] });
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
                isNull(memos.deletedAt),
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
