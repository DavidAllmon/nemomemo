import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Changelog' };

interface Bullet {
  lead: string | null;
  text: string;
}

interface Release {
  version: string;
  date: string;
  bullets: Bullet[];
}

/**
 * Releases live in docs/changelog/vX.Y.Z.md (see its README). This page renders
 * only the plain-language "What's new" section — "Technical notes" stays in the
 * repo for developers.
 */
function loadReleases(): Release[] {
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

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  const releases = loadReleases();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl font-bold">What&apos;s new in the reef</h1>
      <p className="mt-3 text-lg text-ocean-muted">
        Every NemoMemo release, in plain water — no jargon, just what changed for you.
        Your reef&apos;s version is on its About page.
      </p>
      <div className="mt-10 flex flex-col gap-8">
        {releases.map((release) => (
          <section key={release.version} className="rounded-2xl border border-ocean-border bg-ocean-card p-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-2xl font-bold">v{release.version}</h2>
              <p className="text-sm text-ocean-muted">{formatDate(release.date)}</p>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {release.bullets.map((bullet, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed text-ocean-muted">
                  <span aria-hidden>🫧</span>
                  <span>
                    {bullet.lead ? <strong className="text-ocean-ink">{bullet.lead}</strong> : null}
                    {bullet.lead ? ' ' : ''}
                    {bullet.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
