import { updateInstanceSettingsRequestSchema, type InstanceProfileDto } from '@nemomemo/shared';
import { zValidator } from '@hono/zod-validator';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireAdmin, type AppEnv } from '../middleware/auth.js';
import {
  getInstanceGeneral,
  getInstanceMemoSetting,
  setInstanceGeneral,
  setInstanceMemoSetting,
} from '../services/settings.js';

export function instanceRoutes(db: Db, config: Config): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/profile', (c) => {
    const general = getInstanceGeneral(db);
    const userCount = db.select({ count: sql<number>`count(*)` }).from(users).get()?.count ?? 0;
    const profile: InstanceProfileDto = {
      name: general.name,
      description: general.description,
      version: config.version,
      publicMode: general.publicMode,
      allowRegistration: general.allowRegistration,
      needsSetup: userCount === 0,
    };
    return c.json(profile);
  });

  app.get('/settings', (c) => {
    requireAdmin(c);
    return c.json({ general: getInstanceGeneral(db), memo: getInstanceMemoSetting(db) });
  });

  // Reaction set is public info (the picker needs it); no secrets in memo settings.
  app.get('/settings/memo', (c) => {
    return c.json(getInstanceMemoSetting(db));
  });

  app.patch('/settings', zValidator('json', updateInstanceSettingsRequestSchema), (c) => {
    requireAdmin(c);
    const body = c.req.valid('json');
    const general = body.general ? setInstanceGeneral(db, body.general) : getInstanceGeneral(db);
    const memo = body.memo ? setInstanceMemoSetting(db, body.memo) : getInstanceMemoSetting(db);
    return c.json({ general, memo });
  });

  return app;
}
