import { updateInstanceSettingsRequestSchema, type InstanceProfileDto } from '@nemomemo/shared';
import { zValidator } from '@hono/zod-validator';
import type { Archiver, ArchiverOptions } from 'archiver';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

// archiver is CJS; createRequire sidesteps default-import interop differences
// between node (tsx/tsup) and vitest's vite-node transform.
const archiver = createRequire(import.meta.url)('archiver') as (
  format: 'zip',
  options?: ArchiverOptions,
) => Archiver;
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

  /**
   * Full-reef backup: a zip of a consistent SQLite snapshot (via better-sqlite3's
   * online backup API — safe while the app is live) plus the uploads directory.
   * Restore instructions live in the deploy docs; the layout matches the data dir.
   */
  app.get('/backup', async (c) => {
    requireAdmin(c);
    const snapshotPath = path.join(os.tmpdir(), `nemomemo-snapshot-${Date.now()}-${process.pid}.db`);
    await db.$client.backup(snapshotPath);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.file(snapshotPath, { name: 'nemomemo.db' });
    if (fs.existsSync(config.uploadsDir)) {
      archive.directory(config.uploadsDir, 'uploads');
    }
    void archive.finalize();
    archive.on('close', () => fs.rm(snapshotPath, { force: true }, () => {}));
    archive.on('end', () => fs.rm(snapshotPath, { force: true }, () => {}));

    const date = new Date().toISOString().slice(0, 10);
    return new Response(Readable.toWeb(archive) as ReadableStream, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="nemomemo-backup-${date}.zip"`,
        'cache-control': 'no-store',
      },
    });
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
