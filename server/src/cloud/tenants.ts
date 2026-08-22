import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import { makeApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import type { AppEnv } from '../middleware/auth.js';

export interface ReefHandle {
  slug: string;
  app: Hono<AppEnv>;
  db: Db;
  config: Config;
}

/** Mirrors the SPA fallback the single-tenant entry point attaches in index.ts. */
function attachSpa(app: Hono<AppEnv>, webDist: string): void {
  const root = path.relative(process.cwd(), webDist);
  app.use('/*', serveStatic({ root }));
  app.get('*', (c) => {
    const indexHtml = fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');
    return c.html(indexHtml);
  });
}

/**
 * Per-reef app/db handles, opened lazily (migrations run on first open) and
 * kept in an LRU so a long tail of idle reefs doesn't hold file handles.
 * Eviction is safe: better-sqlite3 is synchronous, so no request can hold an
 * evicted handle across an await inside its own DB work.
 */
export class ReefFleet {
  private open = new Map<string, ReefHandle>();

  constructor(
    private base: Config,
    private reefsDir: string,
    private maxOpen = 64,
    private limits: Config['cloudLimits'] = null,
  ) {}

  get(slug: string): ReefHandle {
    const existing = this.open.get(slug);
    if (existing) {
      // Re-insert to mark most-recently-used (Map preserves insertion order).
      this.open.delete(slug);
      this.open.set(slug, existing);
      return existing;
    }

    const reefDir = path.join(this.reefsDir, slug);
    const config = loadConfig({
      dataDir: reefDir,
      dbPath: path.join(reefDir, 'nemomemo.db'),
      uploadsDir: path.join(reefDir, 'uploads'),
      doryTtlSeconds: this.base.doryTtlSeconds,
      webDistDir: this.base.webDistDir,
      version: this.base.version,
      port: this.base.port,
      cloudLimits: this.limits,
    });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    const db = createDb(config.dbPath);
    const app = makeApp(db, config);
    if (config.webDistDir && fs.existsSync(config.webDistDir)) {
      attachSpa(app, config.webDistDir);
    }

    const handle: ReefHandle = { slug, app, db, config };
    this.open.set(slug, handle);
    while (this.open.size > this.maxOpen) {
      const oldest = this.open.keys().next().value as string;
      this.evict(oldest);
    }
    return handle;
  }

  openHandles(): ReefHandle[] {
    return [...this.open.values()];
  }

  evict(slug: string): void {
    const handle = this.open.get(slug);
    if (!handle) return;
    this.open.delete(slug);
    handle.db.$client.close();
  }

  closeAll(): void {
    for (const slug of [...this.open.keys()]) this.evict(slug);
  }
}
