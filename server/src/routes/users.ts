import {
  adminCreateUserRequestSchema,
  adminUpdateUserRequestSchema,
  isValidTagName,
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
import { sendInviteEmail, sendVerificationEmail } from './auth.js';
import { emailChangedMessage, passwordChangedMessage, trySend, type Mailer } from '../services/email.js';
import { randomBytes } from 'node:crypto';
import { nowSeconds } from '../lib/time.js';
import { requireAdmin, requireViewer, type AppEnv } from '../middleware/auth.js';
import { captureRevision } from '../services/revision-service.js';
import {
  aggregateTagCounts,
  aggregateUserStats,
  buildPayload,
  userToDto,
} from '../services/memo-service.js';
import {
  getInstanceGeneral,
  getMemoTemplates,
  getMemoViews,
  getUserGeneral,
  setMemoTemplates,
  setMemoViews,
  setUserGeneral,
} from '../services/settings.js';

export function userRoutes(db: Db, mailer: Mailer | null): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ---------- Viewer's own resources (the `-` segment, like memos) ----------

  /** Members the viewer can @mention — any active account on the instance. */
  app.get('/-/mentionable', (c) => {
    requireViewer(c);
    const rows = db
      .select({ username: users.username, nickname: users.nickname })
      .from(users)
      .where(eq(users.rowStatus, 'NORMAL'))
      .orderBy(asc(users.username))
      .all();
    return c.json({ users: rows.map((row) => ({ username: row.username, nickname: row.nickname || row.username })) });
  });

  app.get('/-/tags', (c) => {
    const viewer = requireViewer(c);
    const tags = aggregateTagCounts(db, {
      viewer,
      allowAnonymous: false,
      state: 'NORMAL',
      scope: 'home',
    });
    return c.json({ tags });
  });

  app.post('/-/tags/rename', zValidator('json', renameTagRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const { from, to } = c.req.valid('json');
    if (!isValidTagName(to)) {
      throw apiError('INVALID_ARGUMENT', 'New tag name contains invalid characters');
    }
    const own = db.select().from(memos).where(eq(memos.creatorId, viewer.id)).all();
    const rename = db.$client.transaction(() => {
      let changed = 0;
      const now = nowSeconds();
      for (const memo of own) {
        const next = renameTagInContent(memo.content, from, to);
        if (next !== memo.content) {
          // A rename is an edit like any other: the old words go to History
          // first, so "my memo changed" always has an answer.
          captureRevision(db, memo.id, memo.content, now);
          const { payload } = buildPayload(next);
          db.update(memos)
            .set({ content: next, payload, updatedTs: now })
            .where(eq(memos.id, memo.id))
            .run();
          changed++;
        }
      }
      return changed;
    });
    const changed = rename();

    // Sidebar settings follow the tag to its new name: colors and pins move
    // over; on a merge, the target tag's own color wins.
    const general = getUserGeneral(db, viewer.id);
    const renameKey = (key: string) =>
      key === from || key.startsWith(from + '/') ? to + key.slice(from.length) : key;
    const tagColors: Record<string, (typeof general.tagColors)[string]> = {};
    for (const [key, color] of Object.entries(general.tagColors)) {
      if (renameKey(key) === key) tagColors[key] = color;
    }
    for (const [key, color] of Object.entries(general.tagColors)) {
      const next = renameKey(key);
      if (next !== key && !(next in tagColors)) tagColors[next] = color;
    }
    const pinnedTags = [...new Set(general.pinnedTags.map(renameKey))];
    if (
      JSON.stringify(tagColors) !== JSON.stringify(general.tagColors) ||
      JSON.stringify(pinnedTags) !== JSON.stringify(general.pinnedTags)
    ) {
      setUserGeneral(db, viewer.id, { tagColors, pinnedTags });
    }

    return c.json({ changed });
  });

  app.get('/-/settings', (c) => {
    const viewer = requireViewer(c);
    return c.json({
      general: getUserGeneral(db, viewer.id),
      memoViews: getMemoViews(db, viewer.id),
      memoTemplates: getMemoTemplates(db, viewer.id),
    });
  });

  app.patch('/-/settings', zValidator('json', updateUserSettingsRequestSchema), (c) => {
    const viewer = requireViewer(c);
    const body = c.req.valid('json');
    const general = body.general ? setUserGeneral(db, viewer.id, body.general) : getUserGeneral(db, viewer.id);
    const memoViews = body.memoViews ? setMemoViews(db, viewer.id, body.memoViews) : getMemoViews(db, viewer.id);
    const memoTemplates = body.memoTemplates
      ? setMemoTemplates(db, viewer.id, body.memoTemplates)
      : getMemoTemplates(db, viewer.id);
    return c.json({ general, memoViews, memoTemplates });
  });

  app.patch('/-/account', zValidator('json', updateAccountRequestSchema), async (c) => {
    const viewer = requireViewer(c);
    const body = c.req.valid('json');
    const patch: Record<string, unknown> = { updatedTs: nowSeconds() };
    if (body.nickname != null) patch.nickname = body.nickname;
    const emailChanged = body.email != null && body.email !== viewer.email;
    if (emailChanged) {
      if (!body.email && viewer.email) {
        throw apiError('INVALID_ARGUMENT', "Your email keeps your account rescuable — change it, don't remove it");
      }
      if (body.email) {
        const taken = db.select().from(users).where(eq(users.email, body.email)).get();
        if (taken && taken.id !== viewer.id) {
          throw apiError('ALREADY_EXISTS', 'That email already belongs to a reef account');
        }
      }
      patch.email = body.email;
      patch.emailVerifiedTs = null;
    }
    if (body.avatarUrl != null) patch.avatarUrl = body.avatarUrl;
    if (body.description != null) patch.description = body.description;
    if (body.password) patch.passwordHash = await bcrypt.hash(body.password, 12);
    const updated = db.update(users).set(patch).where(eq(users.id, viewer.id)).returning().get();
    const instanceName = getInstanceGeneral(db).name;
    if (emailChanged && updated.email) {
      sendVerificationEmail(db, mailer, c, updated);
      // Heads-up to the OLD address — the takeover tripwire.
      if (viewer.email) {
        trySend(mailer, {
          to: viewer.email,
          ...emailChangedMessage(instanceName, updated.username, updated.email),
        });
      }
    }
    if (body.password && updated.email) {
      trySend(mailer, { to: updated.email, ...passwordChangedMessage(instanceName, updated.username) });
    }
    return c.json({ user: userToDto(updated, { includeEmail: true }) });
  });

  // ---------- Admin member management ----------

  app.get('/', (c) => {
    requireAdmin(c);
    const rows = db.select().from(users).orderBy(asc(users.id)).all();
    return c.json({ users: rows.map((row) => userToDto(row, { includeEmail: true })) });
  });

  app.post('/', zValidator('json', adminCreateUserRequestSchema), async (c) => {
    const admin = requireAdmin(c);
    const body = c.req.valid('json');
    if (!body.password && !mailer) {
      throw apiError(
        'INVALID_ARGUMENT',
        'This reef has no email set up — choose a password for the new member instead',
      );
    }
    if (db.select().from(users).where(eq(users.username, body.username)).get()) {
      throw apiError('ALREADY_EXISTS', 'That username is already taken');
    }
    if (db.select().from(users).where(eq(users.email, body.email)).get()) {
      throw apiError('ALREADY_EXISTS', 'That email already belongs to a reef account');
    }
    // No password = invited: an unusable random hash until they set their own
    // via the emailed link (which also verifies the address).
    const passwordHash = await bcrypt.hash(body.password ?? randomBytes(32).toString('hex'), 12);
    const created = db
      .insert(users)
      .values({
        username: body.username,
        nickname: body.nickname ?? body.username,
        email: body.email,
        passwordHash,
        role: body.role,
      })
      .returning()
      .get();
    if (!body.password) {
      sendInviteEmail(db, mailer, c, created, admin.nickname || admin.username);
    }
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
    const stats = aggregateUserStats(db, {
      viewer,
      allowAnonymous: getInstanceGeneral(db).publicMode,
      state: 'NORMAL',
      scope: viewer?.id === user.id ? 'home' : 'profile',
      creatorUsername: viewer?.id === user.id ? undefined : username,
    });
    return c.json(stats);
  });

  return app;
}
