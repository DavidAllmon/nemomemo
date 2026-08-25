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

// archiver/yauzl are CJS; createRequire sidesteps default-import interop
// differences between node (tsx/tsup) and vitest's vite-node transform.
const require_ = createRequire(import.meta.url);
const archiver = require_('archiver') as (format: 'zip', options?: ArchiverOptions) => Archiver;
const yauzl = require_('yauzl') as typeof import('yauzl');
const Sqlite = require_('better-sqlite3') as typeof import('better-sqlite3');

const MAX_RESTORE_BYTES = 1024 * 1024 * 1024;

/** Extract a zip into destDir with a zip-slip guard. */
function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.on('error', reject);
      zipfile.on('end', () => resolve());
      zipfile.on('entry', (entry) => {
        const dest = path.join(destDir, entry.fileName);
        if (!path.resolve(dest).startsWith(path.resolve(destDir) + path.sep)) {
          zipfile.close();
          return reject(new Error(`zip entry escapes staging: ${entry.fileName}`));
        }
        if (entry.fileName.endsWith('/')) {
          fs.mkdirSync(dest, { recursive: true });
          zipfile.readEntry();
          return;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const out = fs.createWriteStream(dest);
          stream.pipe(out);
          out.on('finish', () => zipfile.readEntry());
          out.on('error', reject);
          stream.on('error', reject);
        });
      });
      zipfile.readEntry();
    });
  });
}

/** Rename a file/dir out of the way if it exists (keeps a safety copy). */
function setAside(target: string, suffix: string): void {
  if (fs.existsSync(target)) fs.renameSync(target, `${target}${suffix}`);
}
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import { apiError } from '../lib/errors.js';
import type { Mailer } from '../services/email.js';
import { requireAdmin, type AppEnv } from '../middleware/auth.js';
import {
  getInstanceGeneral,
  getInstanceMemoSetting,
  setInstanceGeneral,
  setInstanceMemoSetting,
} from '../services/settings.js';

export function instanceRoutes(db: Db, config: Config, mailer: Mailer | null): Hono<AppEnv> {
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
      emailEnabled: mailer != null,
      dictationEnabled: config.dictate != null,
      telegramEnabled: config.telegram != null,
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

  /**
   * Restore from a backup zip (self-host only): validate the uploaded database,
   * set the current db + uploads aside as safety copies, swap the backup in,
   * then restart so the fresh database takes over. Cloud reefs are backed up
   * and restored by the service — this endpoint refuses there, because a
   * restart would take down every reef in the shared process.
   */
  app.post('/restore', async (c) => {
    requireAdmin(c);
    if (config.cloudLimits) {
      throw apiError(
        'INVALID_ARGUMENT',
        'Cloud reefs are backed up automatically — contact support to roll back to a date',
      );
    }
    const declaredSize = Number(c.req.header('content-length') ?? 0);
    if (declaredSize > MAX_RESTORE_BYTES) {
      throw apiError('INVALID_ARGUMENT', 'Backup is larger than 1 GB — restore it manually (see the deploy docs)');
    }
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw apiError('INVALID_ARGUMENT', 'Expected a `file` upload with the backup zip');

    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-restore-'));
    try {
      const zipPath = path.join(stage, 'backup.zip');
      fs.writeFileSync(zipPath, Buffer.from(await file.arrayBuffer()));
      const extracted = path.join(stage, 'extracted');
      fs.mkdirSync(extracted);
      await extractZip(zipPath, extracted);

      const stagedDb = path.join(extracted, 'nemomemo.db');
      if (!fs.existsSync(stagedDb)) {
        throw apiError('INVALID_ARGUMENT', "That zip doesn't look like a NemoMemo backup (no nemomemo.db inside)");
      }
      const check = new Sqlite(stagedDb, { readonly: true });
      try {
        const integrity = check.pragma('integrity_check', { simple: true });
        const hasMemoTable = check
          .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('memo', 'user')")
          .get() as { n: number };
        if (integrity !== 'ok' || hasMemoTable.n < 2) {
          throw apiError('INVALID_ARGUMENT', 'The backup database failed its health check — restore aborted, nothing changed');
        }
      } finally {
        check.close();
      }

      // Swap. The live handle keeps pointing at the set-aside file until the
      // restart, so nothing here can corrupt the running database.
      const suffix = `.pre-restore-${Date.now()}`;
      setAside(config.dbPath, suffix);
      setAside(`${config.dbPath}-wal`, suffix);
      setAside(`${config.dbPath}-shm`, suffix);
      fs.renameSync(stagedDb, config.dbPath);
      setAside(config.uploadsDir, suffix);
      const stagedUploads = path.join(extracted, 'uploads');
      if (fs.existsSync(stagedUploads)) {
        fs.renameSync(stagedUploads, config.uploadsDir);
      } else {
        fs.mkdirSync(config.uploadsDir, { recursive: true });
      }

      console.log(`[restore] backup restored; previous data kept with suffix ${suffix}`);
      config.requestRestart?.();
      return c.json({ ok: true, restarting: config.requestRestart != null });
    } finally {
      fs.rm(stage, { recursive: true, force: true }, () => {});
    }
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
