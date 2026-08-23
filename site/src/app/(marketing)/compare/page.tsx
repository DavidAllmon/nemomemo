import Link from 'next/link';
import type { ReactNode } from 'react';
import { DEMO_LABEL, DEMO_URL } from '@/lib/demo-url';
import {
  GoldfishMark,
  NautilusMark,
  OctopusMark,
  ReefCousinMark,
  WaveEdge,
} from '@/components/sea-life';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'Compare',
  description:
    'How NemoMemo compares to Memos, Notion, Google Keep, and Obsidian — an honest field guide to when a self-hosted memo timeline is the right tool, and when it is not.',
  path: '/compare',
});

const CREATURES: {
  name: string;
  href: string;
  creature: ReactNode;
  species: string;
  blurb: string;
}[] = [
  {
    name: 'Notion',
    href: '/compare/notion',
    creature: <OctopusMark className="size-20" />,
    species: 'The octopus',
    blurb:
      'Eight arms, does everything — pages, databases, whole workspaces. Magnificent, and a lot of animal to feed for a two-line thought.',
  },
  {
    name: 'Google Keep',
    href: '/compare/google-keep',
    creature: <GoldfishMark className="h-16 w-20" />,
    species: 'The goldfish',
    blurb:
      "Quick, friendly, everywhere — but it lives in someone else's bowl, and moving a goldfish out of Google's bowl is harder than it looks.",
  },
  {
    name: 'Obsidian',
    href: '/compare/obsidian',
    creature: <NautilusMark className="h-18 w-20" />,
    species: 'The nautilus',
    blurb:
      "A spiral vault built one linked chamber at a time. Beautiful for a life's work; heavy armor for a parking spot.",
  },
  {
    name: 'Memos',
    href: '/compare/memos',
    creature: <ReefCousinMark className="h-16 w-20" />,
    species: 'The reef cousin',
    blurb:
      'Our open-source inspiration, swimming in the same waters. Genuinely excellent — this page mostly tells you when to pick it.',
  },
];

const ROWS = [
  { label: 'License', nemo: 'ELv2 — source-available, free to self-host', others: 'Varies — often proprietary' },
  { label: 'Where your notes live', nemo: 'Your server, one SQLite file', others: 'Their cloud' },
  { label: 'Cost', nemo: '$0 forever', others: 'Free tiers with paid ceilings' },
  { label: 'Format', nemo: 'Plain Markdown', others: 'Proprietary blocks/databases' },
  { label: 'Ephemeral notes', nemo: 'Built in (Dory memos, 24h)', others: 'Manual cleanup' },
  { label: 'Personality', nemo: 'A clownfish', others: 'A productivity gradient' },
];

export default function ComparePage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-b from-ocean-abyss to-ocean-bg px-4 pt-16 text-center">
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
          The other fish in the sea
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-ocean-muted">
          Every notes app is a different animal. NemoMemo does one thing — quick, private capture
          with permission to forget — so here&apos;s an honest field guide to the rest of the water.
        </p>
        <div className="h-12" />
      </section>

      {/* Field guide rows */}
      <section className="mx-auto w-full max-w-3xl px-4">
        <div className="flex flex-col">
          {CREATURES.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="group flex flex-col items-start gap-5 border-b border-ocean-border py-8 first:border-t sm:flex-row sm:items-center sm:gap-8"
            >
              <div className="flex size-28 shrink-0 items-center justify-center rounded-full border-2 border-ocean-border bg-ocean-card transition-colors group-hover:border-ocean-primary">
                {entry.creature}
              </div>
              <div className="flex-1">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ocean-blue">
                  {entry.species}
                </p>
                <p className="mt-1 font-display text-2xl font-bold">
                  NemoMemo vs. {entry.name}
                </p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ocean-muted">{entry.blurb}</p>
              </div>
              <span
                className="hidden shrink-0 font-bold text-ocean-primary opacity-0 transition-opacity group-hover:opacity-100 sm:block"
                aria-hidden
              >
                dive in →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Quick chart */}
      <section className="mx-auto w-full max-w-3xl px-4 py-16">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ocean-muted">
          The quick chart
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-ocean-border">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ocean-border bg-ocean-card">
                <th className="p-4 font-display" />
                <th className="p-4 font-display">NemoMemo 🐠</th>
                <th className="p-4 font-display text-ocean-muted">Typical notes apps</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-ocean-border last:border-0">
                  <td className="p-4 font-bold">{row.label}</td>
                  <td className="p-4">{row.nemo}</td>
                  <td className="p-4 text-ocean-muted">{row.others}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <WaveEdge fill="oklch(0.17 0.04 255)" />
      <section className="bg-[oklch(0.17_0.04_255)] px-4 pb-16 pt-8 text-center">
        <p className="font-display text-xl font-bold">Still deciding?</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ocean-muted">
          The demo takes thirty seconds and no account setup — that&apos;s usually faster than
          reading four comparisons.
        </p>
        <a
          href={DEMO_URL}
          className="mt-5 inline-block rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
        >
          {DEMO_LABEL}
        </a>
      </section>
    </div>
  );
}
