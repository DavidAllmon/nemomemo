import { serve } from '@hono/node-server';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { sweepDoryMemos } from '../services/dory-sweeper.js';
import { makeCloudApp, type CloudSettings } from './app.js';
import { billingRoutes } from './billing.js';
import { Registry } from './registry.js';
import { makeStripeGateway } from './stripe.js';
import { ReefFleet } from './tenants.js';

export function loadCloudSettings(): CloudSettings {
  const baseDomain = process.env.NEMOMEMO_CLOUD_DOMAIN ?? 'trynemomemo.com';
  return {
    baseDomain,
    appHost: process.env.NEMOMEMO_CLOUD_APP_HOST ?? `app.${baseDomain}`,
  };
}

export function startCloud(): void {
  const base = loadConfig();
  const settings = loadCloudSettings();
  const registry = new Registry(path.join(base.dataDir, 'registry.db'));
  const fleet = new ReefFleet(
    base,
    path.join(base.dataDir, 'reefs'),
    Number(process.env.NEMOMEMO_CLOUD_MAX_OPEN_REEFS ?? 64),
  );
  // Billing switches on only when Stripe env is present; without it the cloud
  // still serves reefs (useful for local poking and the pre-billing rollout).
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const priceMonth = process.env.STRIPE_PRICE_MONTHLY_ID;
  const priceYear = process.env.STRIPE_PRICE_YEARLY_ID;
  let billing;
  if (stripeKey && webhookSecret && priceMonth && priceYear) {
    billing = billingRoutes({
      registry,
      fleet,
      gateway: makeStripeGateway(stripeKey, webhookSecret),
      appUrl: process.env.NEMOMEMO_CLOUD_APP_URL ?? `https://${settings.appHost}`,
      baseDomain: settings.baseDomain,
      cancelUrl: process.env.NEMOMEMO_CLOUD_CANCEL_URL ?? `https://${settings.baseDomain}/pricing`,
      prices: { month: priceMonth, year: priceYear },
      reefsDir: path.join(base.dataDir, 'reefs'),
    });
    console.log('[cloud] Stripe billing routes enabled');
  } else {
    console.log('[cloud] Stripe env incomplete — billing routes disabled');
  }
  const app = makeCloudApp(registry, fleet, settings, billing);

  // Dory sweeps run per open reef; a closed reef is swept on its next open,
  // and every read path already refuses expired memos regardless.
  const timer = setInterval(() => {
    for (const handle of fleet.openHandles()) {
      try {
        sweepDoryMemos(handle.db, handle.config.uploadsDir);
      } catch (error) {
        console.error(`[dory] cloud sweep failed for reef ${handle.slug}:`, error);
      }
    }
  }, 60_000);
  timer.unref();

  serve({ fetch: app.fetch, port: base.port }, (info) => {
    console.log(`🌊 NemoMemo Cloud swimming at http://localhost:${info.port} (*.${settings.baseDomain})`);
  });
}
