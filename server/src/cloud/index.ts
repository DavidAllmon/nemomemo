import { serve } from '@hono/node-server';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { sweepDoryMemos } from '../services/dory-sweeper.js';
import { makeCloudApp, type CloudSettings } from './app.js';
import type { BillingDeps } from './billing.js';
import { makeSmtpMailer } from '../services/email.js';
import { sweepExpiredReefs } from './reef-sweeper.js';
import { sweepStagedRestores } from './restore-sweeper.js';
import { ensureRestoreDirs } from './snapshots.js';
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
  // Fair-use brakes ("unlimited in spirit"): raiseable via env, never lowered silently.
  const limits = {
    maxMembers: Number(process.env.NEMOMEMO_CLOUD_MAX_MEMBERS ?? 25),
    maxStorageBytes: Number(process.env.NEMOMEMO_CLOUD_MAX_STORAGE_GB ?? 5) * 1024 * 1024 * 1024,
  };
  const fleet = new ReefFleet(
    base,
    path.join(base.dataDir, 'reefs'),
    Number(process.env.NEMOMEMO_CLOUD_MAX_OPEN_REEFS ?? 64),
    limits,
  );
  // Billing switches on only when Stripe env is present; without it the cloud
  // still serves reefs (useful for local poking and the pre-billing rollout).
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const priceMonth = process.env.STRIPE_PRICE_MONTHLY_ID;
  const priceYear = process.env.STRIPE_PRICE_YEARLY_ID;
  let billing: BillingDeps | undefined;
  if (stripeKey && webhookSecret && priceMonth && priceYear) {
    billing = {
      registry,
      fleet,
      gateway: makeStripeGateway(stripeKey, webhookSecret),
      appUrl: process.env.NEMOMEMO_CLOUD_APP_URL ?? `https://${settings.appHost}`,
      baseDomain: settings.baseDomain,
      cancelUrl: process.env.NEMOMEMO_CLOUD_CANCEL_URL ?? `https://${settings.baseDomain}/pricing`,
      prices: { month: priceMonth, year: priceYear },
      reefsDir: path.join(base.dataDir, 'reefs'),
      mailer: base.smtp ? makeSmtpMailer(base.smtp) : null,
    };
    console.log('[cloud] Stripe billing routes enabled');
  } else {
    console.log('[cloud] Stripe env incomplete — billing routes disabled');
  }
  const app = makeCloudApp(registry, fleet, settings, base.dataDir, billing);

  // ToS 90-day promise: delete reefs suspended past the grace window, daily.
  const reefsDir = path.join(base.dataDir, 'reefs');
  const reefSweep = () => {
    try {
      sweepExpiredReefs(registry, fleet, reefsDir, Math.floor(Date.now() / 1000));
    } catch (error) {
      console.error('[cloud] reef sweep failed:', error);
    }
  };
  reefSweep();
  const reefSweepTimer = setInterval(reefSweep, 24 * 3600 * 1000);
  reefSweepTimer.unref?.();

  // Snapshot rollback: the host worker stages verified restores into the
  // volume; we swap them in. 10s cadence — an idle scan is one readdir.
  ensureRestoreDirs(base.dataDir);
  const restoreSweep = () => {
    try {
      sweepStagedRestores(fleet, base.dataDir);
    } catch (error) {
      console.error('[cloud] restore sweep failed:', error);
    }
  };
  restoreSweep();
  const restoreTimer = setInterval(restoreSweep, 10_000);
  restoreTimer.unref?.();

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
