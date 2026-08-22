import { serve } from '@hono/node-server';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { sweepDoryMemos } from '../services/dory-sweeper.js';
import { makeCloudApp, type CloudSettings } from './app.js';
import { Registry } from './registry.js';
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
  const app = makeCloudApp(registry, fleet, settings);

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
