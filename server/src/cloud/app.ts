import { Hono } from 'hono';
import type { Context } from 'hono';
import { billingRoutes, handleReefCloudApi, type BillingDeps } from './billing.js';
import { REEF_SLUG_RE, type Registry } from './registry.js';
import type { ReefFleet } from './tenants.js';

export interface CloudSettings {
  /** Customer reefs live at `<slug>.<baseDomain>`. */
  baseDomain: string;
  /** The sign-up/claim/billing host (checkout lands here, no reef data). */
  appHost: string;
}

/** API-ish paths get JSON errors; everything else gets a tiny fish page. */
function reefError(c: Context, status: 403 | 404, code: string, message: string): Response {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.startsWith('/api/') || pathname.startsWith('/file/')) {
    return c.json({ error: { code, message } }, status);
  }
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>NemoMemo</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:3rem">🐠</div><h1>${message}</h1>
<p>Just keep swimming — <a href="https://trynemomemo.com">trynemomemo.com</a></p></div></body>`,
    status,
  );
}

/** The apex/app host: health, checkout, webhook, and the claim flow. */
export function makePortalApp(billing?: Hono): Hono {
  const portal = new Hono();
  portal.get('/healthz', (c) => c.json({ ok: true, service: 'nemomemo-cloud' }));
  if (billing) portal.route('/', billing);
  portal.get('/', (c) => c.json({ service: 'nemomemo-cloud', message: 'Just keep swimming 🐠' }));
  portal.all('*', (c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404),
  );
  return portal;
}

/**
 * The cloud front door: resolves the reef from the Host header and delegates
 * to that reef's own app instance. A request physically cannot reach another
 * reef's database — each tenant app closes over its own Db handle.
 */
export function makeCloudApp(
  registry: Registry,
  fleet: ReefFleet,
  settings: CloudSettings,
  billing?: BillingDeps,
): Hono {
  const portal = makePortalApp(billing ? billingRoutes(billing) : undefined);
  const baseDomain = settings.baseDomain.toLowerCase();
  const appHost = settings.appHost.toLowerCase();
  const portalHosts = new Set([appHost, baseDomain, `www.${baseDomain}`]);

  const app = new Hono();
  // Host-agnostic health endpoint: Docker's healthcheck (and any monitor
  // probing by IP) has no reef hostname to offer.
  app.get('/healthz', (c) => c.json({ ok: true, service: 'nemomemo-cloud' }));
  app.all('*', (c) => {
    const rawHost = c.req.header('host') ?? new URL(c.req.url).host;
    const host = rawHost.toLowerCase().split(':')[0]!;

    if (portalHosts.has(host)) return portal.fetch(c.req.raw);

    const suffix = `.${baseDomain}`;
    if (!host.endsWith(suffix)) {
      return reefError(c, 404, 'NOT_FOUND', 'This reef swam away');
    }
    const slug = host.slice(0, -suffix.length);
    if (!REEF_SLUG_RE.test(slug)) {
      return reefError(c, 404, 'NOT_FOUND', 'This reef swam away');
    }
    const reef = registry.getReefBySlug(slug);
    if (!reef || reef.status === 'canceled') {
      return reefError(c, 404, 'NOT_FOUND', 'This reef swam away');
    }
    if (reef.status === 'suspended') {
      if (billing) {
        const wakeUrl = `${billing.appUrl}/cloud/rescue?reef=${slug}`;
        const accept = c.req.header('accept') ?? '';
        const pathname = new URL(c.req.url).pathname;
        if (!pathname.startsWith('/api/') && !pathname.startsWith('/file/') && accept.includes('text/html')) {
          return c.html(
            `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Taking a nap · NemoMemo</title><style>body{font-family:system-ui;margin:0;min-height:100vh;display:grid;place-items:center;background:#f0f9ff;color:#0c4a6e}main{max-width:26rem;padding:2rem;background:#fff;border-radius:1rem;box-shadow:0 8px 30px rgb(2 132 199 / .12);margin:1rem;text-align:center}a.btn{display:inline-block;margin-top:1rem;padding:.7rem 1.4rem;border-radius:.6rem;background:#0284c7;color:#fff;text-decoration:none;font-weight:600}</style></head><body><main><div style="font-size:2.5rem">😴</div><h1>This reef is taking a nap</h1><p>Its subscription lapsed, but your memos are safe for 90 days from suspension.</p><a class="btn" href="${wakeUrl}">Wake it up →</a><p style="font-size:.85rem;color:#0369a1">Fix the payment and everything is exactly as you left it.</p></main></body></html>`,
            403,
          );
        }
        // API/file callers still get JSON, with the rescue URL included.
        return c.json({ error: { code: 'REEF_SUSPENDED', message: 'This reef is taking a nap', rescueUrl: wakeUrl } }, 403);
      }
      return reefError(c, 403, 'REEF_SUSPENDED', 'This reef is taking a nap');
    }
    const handle = fleet.get(slug);
    if (billing && new URL(c.req.url).pathname.startsWith('/api/v1/cloud/')) {
      return handleReefCloudApi(billing, reef, handle, c);
    }
    return handle.app.fetch(c.req.raw);
  });
  return app;
}
