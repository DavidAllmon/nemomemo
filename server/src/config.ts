import path from 'node:path';
import { DORY_TTL_SECONDS } from '@nemomemo/shared';

export interface Config {
  port: number;
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  doryTtlSeconds: number;
  version: string;
  /** Absolute path to the built SPA (served in production); null in dev/tests. */
  webDistDir: string | null;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = overrides.dataDir ?? process.env.NEMOMEMO_DATA ?? path.resolve('data');
  return {
    port: overrides.port ?? Number(process.env.NEMOMEMO_PORT ?? 5230),
    dataDir,
    dbPath: overrides.dbPath ?? path.join(dataDir, 'nemomemo.db'),
    uploadsDir: overrides.uploadsDir ?? path.join(dataDir, 'uploads'),
    doryTtlSeconds:
      overrides.doryTtlSeconds ??
      (process.env.DORY_TTL_SECONDS ? Number(process.env.DORY_TTL_SECONDS) : DORY_TTL_SECONDS),
    version: overrides.version ?? '0.1.0',
    webDistDir: overrides.webDistDir ?? process.env.NEMOMEMO_WEB_DIST ?? null,
  };
}
