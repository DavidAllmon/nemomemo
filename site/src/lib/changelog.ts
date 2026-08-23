import fs from 'node:fs';
import path from 'node:path';

export interface Bullet {
  lead: string | null;
  text: string;
}

export interface Release {
  version: string;
  date: string;
  bullets: Bullet[];
}

/**
 * Releases live in docs/changelog/vX.Y.Z.md (see its README). Build-time only:
 * the site is always built from the repo root (Dockerfile.site copies
 * docs/changelog in), so `..` resolves to the repo. Only the plain-language
 * "What's new" section is used — "Technical notes" stays in the repo.
 */
export function loadReleases(): Release[] {
  const dir = path.join(process.cwd(), '..', 'docs', 'changelog');
  const releases: Release[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!/^v\d+\.\d+\.\d+\.md$/.test(file)) continue;
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const version = /^version:\s*(.+)$/m.exec(raw)?.[1]?.trim();
    const date = /^date:\s*(.+)$/m.exec(raw)?.[1]?.trim();
    if (!version || !date) continue;
    const section = raw.split(/^## What's new\s*$/m)[1]?.split(/^## /m)[0] ?? '';
    const bullets: Bullet[] = [];
    let currentBullet: Bullet | null = null;
    for (const line of section.split('\n')) {
      if (line.startsWith('- ')) {
        if (currentBullet) bullets.push(currentBullet);
        const match = /^- \*\*(.+?)\*\*\s*(.*)$/.exec(line);
        currentBullet = match
          ? { lead: match[1], text: match[2] }
          : { lead: null, text: line.slice(2) };
      } else if (currentBullet && line.trim()) {
        currentBullet.text += ` ${line.trim()}`;
      }
    }
    if (currentBullet) bullets.push(currentBullet);
    if (bullets.length > 0) releases.push({ version, date, bullets });
  }
  const key = (v: string) => v.split('.').map(Number);
  return releases.sort((a, b) => {
    const [am, ai, ap] = key(a.version);
    const [bm, bi, bp] = key(b.version);
    return bm - am || bi - ai || bp - ap;
  });
}

export function formatReleaseDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
