import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { makeApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import type { AppEnv } from '../middleware/auth.js';

export interface TestContext {
  app: Hono<AppEnv>;
  db: Db;
  config: Config;
}

export function makeTestApp(overrides: Partial<Config> = {}): TestContext {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-test-'));
  const config = loadConfig({
    dataDir: scratch,
    dbPath: ':memory:',
    uploadsDir: path.join(scratch, 'uploads'),
    ...overrides,
  });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  const db = createDb(config.dbPath);
  const app = makeApp(db, config);
  return { app, db, config };
}

export async function jsonRequest(
  app: Hono<AppEnv>,
  method: string,
  url: string,
  body?: unknown,
  cookie?: string,
): Promise<Response> {
  return app.request(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Sign up a user and return their session cookie. */
export async function signup(app: Hono<AppEnv>, username: string, password = 'password123'): Promise<string> {
  const response = await jsonRequest(app, 'POST', '/api/v1/auth/signup', { username, password });
  if (response.status !== 200) {
    throw new Error(`signup failed: ${response.status} ${await response.text()}`);
  }
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('signup returned no cookie');
  return setCookie.split(';')[0]!;
}

export async function createMemo(
  app: Hono<AppEnv>,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ uid: string; [key: string]: unknown }> {
  const response = await jsonRequest(app, 'POST', '/api/v1/memos', body, cookie);
  if (response.status !== 201) {
    throw new Error(`createMemo failed: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { memo: { uid: string } };
  return json.memo;
}
