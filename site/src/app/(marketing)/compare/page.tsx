import Link from 'next/link';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'Compare',
  description:
    'How NemoMemo compares to Memos, Notion, Google Keep, and Obsidian — an honest look at when a self-hosted memo timeline is the right tool, and when it is not.',
  path: '/compare',
});

const ROWS = [
  { label: 'License', nemo: 'ELv2 — source-available, free to self-host', others: 'Varies — often proprietary' },
  { label: 'Where your notes live', nemo: 'Your server, one SQLite file', others: 'Their cloud' },
  { label: 'Cost', nemo: '$0 forever', others: 'Free tiers with paid ceilings' },
  { label: 'Format', nemo: 'Plain Markdown', others: 'Proprietary blocks/databases' },
  { label: 'Ephemeral notes', nemo: 'Built in (Dory memos, 24h)', others: 'Manual cleanup' },
  { label: 'Personality', nemo: 'A clownfish', others: 'A productivity gradient' },
];

const GUIDES = [
  {
    name: 'Memos',
    href: '/compare/memos',
    blurb: 'Our open-source inspiration. When to run Memos, and what NemoMemo adds.',
  },
  {
    name: 'Notion',
    href: '/compare/notion',
    blurb: 'A workspace vs. one timeline — for the notes that die waiting on a page.',
  },
  {
    name: 'Google Keep',
    href: '/compare/google-keep',
    blurb: 'The same speed, without handing your notes to Google.',
  },
  {
    name: 'Obsidian',
    href: '/compare/obsidian',
    blurb: 'A knowledge base vs. the notes that come before structure. Many run both.',
  },
];

export default function ComparePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-center font-display text-4xl font-bold">The job, not the feature count</h1>
      <p className="mt-3 text-center text-lg text-ocean-muted">
        NemoMemo does one thing: quick, private capture with permission to forget. Here&apos;s an
        honest look at where that fits.
      </p>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-ocean-border">
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

      <h2 className="mt-12 text-center font-display text-2xl font-bold">The detailed comparisons</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {GUIDES.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="rounded-2xl border border-ocean-border bg-ocean-card p-5 transition-colors hover:border-ocean-primary"
          >
            <p className="font-display text-lg font-bold">vs. {guide.name}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ocean-muted">{guide.blurb}</p>
            <p className="mt-3 text-sm font-bold text-ocean-blue">Read the comparison →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
