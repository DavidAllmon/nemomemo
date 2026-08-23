import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import path from 'node:path';
import { makeSmtpMailer, type Mailer } from './services/email.js';
import { OcrQueue, tesseractEngine } from './services/ocr.js';
import { transcribeEngine } from './services/transcribe.js';
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

export interface AppDeps {
  /** Outbound mail; defaults from config.smtp. Explicit null disables email. */
  mailer?: Mailer | null;
  /** OCR job queue; defaults from config.ocr (shared tesseract engine). Explicit null disables OCR. */
  ocr?: OcrQueue | null;
  /** Voice transcription queue; defaults from config.transcribe. Explicit null disables it. */
  transcribe?: OcrQueue | null;
}

export function makeApp(db: Db, config: Config, deps: AppDeps = {}): Hono<AppEnv> {
  const mailer = 'mailer' in deps ? (deps.mailer ?? null) : config.smtp ? makeSmtpMailer(config.smtp) : null;
  const ocr =
    'ocr' in deps
      ? (deps.ocr ?? null)
      : config.ocr
        ? new OcrQueue(
            db,
            config.uploadsDir,
            tesseractEngine(config.ocr.langs, path.join(config.dataDir, 'ocr-cache')),
          )
        : null;
  const transcribe =
    'transcribe' in deps
      ? (deps.transcribe ?? null)
      : config.transcribe
        ? new OcrQueue(
            db,
            config.uploadsDir,
            transcribeEngine(config.transcribe.url, config.transcribe.key, config.transcribe.model),
          )
        : null;
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
  api.route('/auth', authRoutes(db, config, mailer));
  api.route('/instance', instanceRoutes(db, config, mailer));
  api.route('/memos', memoRoutes(db, config));
  api.route('/shares', shareRoutes(db));
  api.route('/users', userRoutes(db, mailer));
  api.route('/inbox', inboxRoutes(db));
  api.route('/attachments', attachmentRoutes(db, config, ocr, transcribe));

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
