import fs from 'node:fs';
import path from 'node:path';

/**
 * The app's canonical version, read from the repo root at build time (the
 * same root package.json `pnpm release` bumps; Dockerfile.site copies it in).
 */
export const APP_VERSION: string = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), '..', 'package.json'), 'utf8'),
).version;
