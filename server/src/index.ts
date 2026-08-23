import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { makeApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { makeSmtpMailer } from './services/email.js';
import { startScheduler } from './services/scheduler.js';

// Cloud mode (NEMOMEMO_CLOUD=1) is the hosted multi-reef service; everything
// below the branch is the unchanged single-tenant self-host path.
if (process.env.NEMOMEMO_CLOUD === '1') {
  const { startCloud } = await import('./cloud/index.js');
  startCloud();
} else {
  // Docker's restart policy (or the operator) brings the process back up; the
  // delay lets the restore response reach the browser first.
  const config = loadConfig({ requestRestart: () => setTimeout(() => process.exit(0), 500) });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  const db = createDb(config.dbPath);
  const app = makeApp(db, config);

  startScheduler(db, {
    uploadsDir: config.uploadsDir,
    mailer: config.smtp ? makeSmtpMailer(config.smtp) : null,
  });

  // In production the built SPA sits next to the server; serve it with an SPA fallback.
  const webDist = config.webDistDir ?? path.resolve('web-dist');
  if (fs.existsSync(webDist)) {
    const root = path.relative(process.cwd(), webDist);
    app.use('/*', serveStatic({ root }));
    app.get('*', (c) => {
      const indexHtml = fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');
      return c.html(indexHtml);
    });
  }

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`🐠 NemoMemo swimming at http://localhost:${info.port}`);
  });
}
