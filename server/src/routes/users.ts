import {
  adminCreateUserRequestSchema,
  adminUpdateUserRequestSchema,
  renameTagRequestSchema,
  renameTagInContent,
  updateAccountRequestSchema,
  updateUserSettingsRequestSchema,
  type UserStatsDto,
} from '@nemomemo/shared';
import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { memos, users, userSessions } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import { nowSeconds } from '../lib/time.js';
import { requireAdmin, requireViewer, type AppEnv } from '../middleware/auth.js';
import {
  buildPayload,
  listMemoRows,
  parsePayload,
  userToDto,
} from '../services/memo-service.js';
import {
  getInstanceGeneral,
  getMemoViews,
  getUserGeneral,
  setMemoViews,
  setUserGeneral,
} from '../services/settings.js';

const STATS_MEMO_CAP = 10_000;

export function userRoutes(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ---------- Viewer's own resources (the `-` segment, like memos) ----------

  app.get('/-/tags', (c) => {
    const viewer = requireViewer(c);
    const { rows } = listMemoRows(db, {
      viewer,
      allowAnonymous: false,
      state: 'NORMAL',
      scope: 'home',
      orderBy: 'created_ts',
      direction: 'DESC',
      pinnedFirst: false,
      limit: STATS_MEMO_CAP,
      offset: 0,
    });
    const counts: Record<string, number> = {};
    for (const row of rows) {
      for (const tag of parsePayload(row.payload).tags ?? []) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return c.json({ tags: counts });
  });

  app.post('/-/tags/rename', zValidator('json', renameTagRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const { from, to } = c.req.valid('json');
    if (!/^[\p{L}\p{N}_][\p{L}\p{N}_/-]*$/u.test(to)) {
      throw apiError('INVALID_ARGUMENT', 'New tag name contains invalid characters');
    }
    const own = db.select().from(memos).where(eq(memos.creatorId, viewer.id)).all();
    const rename = db.$client.transaction(() => {
      let changed = 0;
      for (const memo of own) {
        const next = renameTagInContent(memo.content, from, to);
        if (next !== memo.content) {
          const { payload } = buildPayload(next);
          db.update(memos)
            .set({ content: next, payload, updatedTs: nowSeconds() })
            .where(eq(memos.id, memo.id))
            .run();
          changed++;
        }
      }
      return changed;
    });
    return c.json({ changed: rename() });
  });

  app.get('/-/settings', (c) => {
    const viewer = requireViewer(c);
    return c.json({
      general: getUserGeneral(db, viewer.id),
      memoViews: getMemoViews(db, viewer.id),
    });
  });

  app.patch('/-/settings', zValidator('json', updateUserSettingsRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const body = c.req.valid('json');
    const general = body.general ? setUserGeneral(db, viewer.id, body.general) : getUserGeneral(db, viewer.id);
    const memoViews = body.memoViews ? setMemoViews(db, viewer.id, body.memoViews) : getMemoViews(db, viewer.id);
    return c.json({ general, memoViews });
  });

  app.patch('/-/account', zValidator('json', updateAccountRequestSchema), async (c) => {
    const viewer = requireViewer(c);
    const body = c.req.valid('json');
    const patch: Record<string, unknown> = { updatedTs: nowSeconds() };
    if (body.nickname != null) patch.nickname = body.nickname;
    if (body.email != null) patch.email = body.email;
    if (body.avatarUrl != null) patch.avatarUrl = body.avatarUrl;
    if (body.description != null) patch.description = body.description;
    if (body.password) patch.passwordHash = await bcrypt.hash(body.password, 12);
    const updated = db.update(users).set(patch).where(eq(users.id, viewer.id)).returning().get();
    return c.json({ user: userToDto(updated, { includeEmail: true }) });
  });

  // ---------- Admin member management ----------

  app.get('/', (c) => {
    requireAdmin(c);
    const rows = db.select().from(users).orderBy(asc(users.id)).all();
    return c.json({ users: rows.map((row) => userToDto(row, { includeEmail: true })) });
  });

  app.post('/', zValidator('json', adminCreateUserRequestSchema), async (c) => {
    requireAdmin(c);
    const body = c.req.valid('json');
    if (db.select().from(users).where(eq(users.username, body.username)).get()) {
      throw apiError('ALREADY_EXISTS', 'That username is already taken');
    }
    const created = db
      .insert(users)
      .values({
        username: body.username,
        nickname: body.nickname ?? body.username,
        passwordHash: await bcrypt.hash(body.password, 12),
        role: body.role,
      })
      .returning()
      .get();
    return c.json({ user: userToDto(created, { includeEmail: true }) }, 201);
  });

  app.patch('/:username/admin', zValidator('json', adminUpdateUserRequestSchema), async (c) => {
    const admin = requireAdmin(c);
    const target = db.select().from(users).where(eq(users.username, c.req.param('username'))).get();
    if (!target) throw apiError('NOT_FOUND', 'User not found');
    if (target.id === admin.id && c.req.valid('json').rowStatus === 'ARCHIVED') {
      throw apiError('INVALID_ARGUMENT', 'You cannot archive your own account');
    }
    const body = c.req.valid('json');
    const patch: Record<string, unknown> = { updatedTs: nowSeconds() };
    if (body.role != null) patch.role = body.role;
    if (body.rowStatus != null) patch.rowStatus = body.rowStatus;
    if (body.password) patch.passwordHash = await bcrypt.hash(body.password, 12);
    const updated = db.update(users).set(patch).where(eq(users.id, target.id)).returning().get();
    if (body.rowStatus === 'ARCHIVED') {
      db.delete(userSessions).where(eq(userSessions.userId, target.id)).run();
    }
    return c.json({ user: userToDto(updated, { includeEmail: true }) });
  });

  app.delete('/:username/admin', (c) => {
    const admin = requireAdmin(c);
    const target = db.select().from(users).where(eq(users.username, c.req.param('username'))).get();
    if (!target) throw apiError('NOT_FOUND', 'User not found');
    if (target.id === admin.id) throw apiError('INVALID_ARGUMENT', 'You cannot delete your own account');
    db.delete(users).where(eq(users.id, target.id)).run();
    return c.json({ ok: true });
  });

  // ---------- Public profile + stats ----------

  app.get('/:username', (c) => {
    const user = db.select().from(users).where(eq(users.username, c.req.param('username'))).get();
    if (!user || user.rowStatus === 'ARCHIVED') throw apiError('NOT_FOUND', 'User not found');
    if (!c.get('viewer') && !getInstanceGeneral(db).publicMode) {
      throw apiError('UNAUTHENTICATED', 'Sign in to view profiles');
    }
    return c.json({ user: userToDto(user) });
  });

  app.get('/:username/stats', (c) => {
    const viewer = c.get('viewer');
    const username = c.req.param('username');
    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user || user.rowStatus === 'ARCHIVED') throw apiError('NOT_FOUND', 'User not found');
    const { rows } = listMemoRows(db, {
      viewer,
      allowAnonymous: getInstanceGeneral(db).publicMode,
      state: 'NORMAL',
      scope: viewer?.id === user.id ? 'home' : 'profile',
      creatorUsername: viewer?.id === user.id ? undefined : username,
      orderBy: 'created_ts',
      direction: 'DESC',
      pinnedFirst: false,
      limit: STATS_MEMO_CAP,
      offset: 0,
    });

    const stats: UserStatsDto = {
      totalMemoCount: rows.length,
      memoCreatedTimestamps: rows.map((row) => row.createdTs),
      tagCounts: {},
      linkCount: 0,
      codeCount: 0,
      taskCount: 0,
      incompleteTaskCount: 0,
      pinnedCount: 0,
    };
    for (const row of rows) {
      const payload = parsePayload(row.payload);
      for (const tag of payload.tags ?? []) {
        stats.tagCounts[tag] = (stats.tagCounts[tag] ?? 0) + 1;
      }
      if (payload.property?.hasLink) stats.linkCount++;
      if (payload.property?.hasCode) stats.codeCount++;
      if (payload.property?.hasTaskList) stats.taskCount++;
      if (payload.property?.hasIncompleteTasks) stats.incompleteTaskCount++;
      if (row.pinned) stats.pinnedCount++;
    }
    return c.json(stats);
  });

  return app;
}
