import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import { viewerMiddleware, type AppEnv } from './middleware/auth.js';
import { attachmentRoutes } from './routes/attachments.js';
import { authRoutes } from './routes/auth.js';
import { fileRoutes } from './routes/file.js';
import { inboxRoutes } from './routes/inbox.js';
import { instanceRoutes } from './routes/instance.js';
import { memoRoutes } from './routes/memos.js';
import { shareRoutes } from './routes/shares.js';
import { userRoutes } from './routes/users.js';

/** Baseline security headers, set only where a route hasn't already chosen its own. */
function applySecurityHeaders(headers: Headers): void {
  const defaults: [string, string][] = [
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
  ];
  for (const [name, value] of defaults) {
    if (!headers.has(name)) headers.set(name, value);
  }
}

export function makeApp(db: Db, config: Config): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.onError((error, c) => {
    const response =
      error instanceof HTTPException
        ? error.getResponse()
        : (console.error('[api] unhandled error:', error),
          c.json({ error: { code: 'INTERNAL', message: 'Something went wrong under the sea' } }, 500));
    applySecurityHeaders(response.headers);
    return response;
  });

  app.use('*', async (c, next) => {
    await next();
    applySecurityHeaders(c.res.headers);
  });

  app.use('*', viewerMiddleware(db));

  app.get('/healthz', (c) => c.json({ ok: true }));

  const api = new Hono<AppEnv>();
  api.route('/auth', authRoutes(db, config));
  api.route('/instance', instanceRoutes(db, config));
  api.route('/memos', memoRoutes(db, config));
  api.route('/shares', shareRoutes(db));
  api.route('/users', userRoutes(db));
  api.route('/inbox', inboxRoutes(db));
  api.route('/attachments', attachmentRoutes(db, config));

  app.route('/api/v1', api);
  app.route('/file', fileRoutes(db, config));

  // Unknown API/file paths must 404 as JSON — never fall through to the SPA page.
  app.all('/api/*', (c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404),
  );
  app.all('/file/*', (c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404),
  );

  return app;
}
