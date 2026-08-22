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
