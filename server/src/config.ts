import path from 'node:path';
import { DORY_TTL_SECONDS, NEMOMEMO_VERSION } from '@nemomemo/shared';

export interface Config {
  port: number;
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  doryTtlSeconds: number;
  version: string;
  /** Absolute path to the built SPA (served in production); null in dev/tests. */
  webDistDir: string | null;
  /** Fair-use brakes for hosted reefs; null (self-host) means no limits. */
  cloudLimits: { maxMembers: number; maxStorageBytes: number } | null;
  /**
   * How this process restarts itself (used after a backup restore so the fresh
   * database takes over). Set by the single-tenant entry point; null in tests
   * and cloud mode (a cloud reef restore must never kill the shared process).
   */
  requestRestart: (() => void) | null;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = overrides.dataDir ?? process.env.NEMOMEMO_DATA ?? path.resolve('data');
  return {
    // PORT is the PaaS convention (Render, Koyeb, Railway, Fly all inject it).
    port: overrides.port ?? Number(process.env.NEMOMEMO_PORT ?? process.env.PORT ?? 5230),
    dataDir,
    dbPath: overrides.dbPath ?? path.join(dataDir, 'nemomemo.db'),
    uploadsDir: overrides.uploadsDir ?? path.join(dataDir, 'uploads'),
    doryTtlSeconds:
      overrides.doryTtlSeconds ??
      (process.env.DORY_TTL_SECONDS ? Number(process.env.DORY_TTL_SECONDS) : DORY_TTL_SECONDS),
    version: overrides.version ?? NEMOMEMO_VERSION,
    webDistDir: overrides.webDistDir ?? process.env.NEMOMEMO_WEB_DIST ?? null,
    cloudLimits: overrides.cloudLimits ?? null,
    requestRestart: overrides.requestRestart ?? null,
  };
}
