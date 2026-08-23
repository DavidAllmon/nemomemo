// Copies the canonical install scripts from the repo root into public/ so the
// static site serves them at https://trynemomemo.com/install.sh and
// /install.ps1. Runs as part of `pnpm build` (see package.json); the repo-root
// files are the single source of truth — never edit the public/ copies.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), '..');
const publicDir = path.join(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });

for (const file of ['install.sh', 'install.ps1']) {
  fs.copyFileSync(path.join(root, file), path.join(publicDir, file));
}
console.log('synced install.sh + install.ps1 into public/');
