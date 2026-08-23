import Link from 'next/link';
import type { ReactNode } from 'react';
import { DEMO_LABEL, DEMO_URL } from '@/lib/demo-url';

export interface Comparison {
  /** Competitor display name, e.g. "Notion". */
  name: string;
  /** The competitor's field-guide creature (from sea-life.tsx). */
  creature?: ReactNode;
  /** Field-guide species label, e.g. "The octopus". */
  species?: string;
  /** H1, e.g. "NemoMemo vs. Notion". */
  heading: string;
  /** One-sentence framing under the H1. */
  subheading: string;
  intro: string[];
  chooseThem: { lead: string; items: string[] };
  chooseUs: { lead: string; items: string[] };
  rows: { label: string; them: string; us: string }[];
  closing: string;
}

export function CompareLayout({ comparison }: { comparison: Comparison }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ocean-muted">
        <Link href="/compare" className="hover:text-ocean-ink">
          Field guide
        </Link>{' '}
        / {comparison.name}
      </p>
      <div className="mt-6 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {comparison.creature ? (
          <div className="flex size-28 shrink-0 items-center justify-center rounded-full border-2 border-ocean-border bg-ocean-card">
            {comparison.creature}
          </div>
        ) : null}
        <div>
          {comparison.species ? (
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ocean-blue">
              {comparison.species}
            </p>
          ) : null}
          <h1 className="mt-1 font-display text-4xl font-bold">{comparison.heading}</h1>
          <p className="mt-2 text-lg text-ocean-muted">{comparison.subheading}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 leading-relaxed">
        {comparison.intro.map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-ocean-border bg-ocean-card p-6">
          <p className="font-display text-lg font-bold">{comparison.chooseThem.lead}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ocean-muted">
            {comparison.chooseThem.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden>—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border-2 border-ocean-primary bg-ocean-card p-6">
          <p className="font-display text-lg font-bold">{comparison.chooseUs.lead}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ocean-muted">
            {comparison.chooseUs.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-ocean-primary" aria-hidden>
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-ocean-border">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ocean-border bg-ocean-card">
              <th className="p-4 font-display" />
              <th className="p-4 font-display text-ocean-muted">{comparison.name}</th>
              <th className="p-4 font-display">NemoMemo 🐠</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.label} className="border-b border-ocean-border last:border-0">
                <td className="p-4 font-bold">{row.label}</td>
                <td className="p-4 text-ocean-muted">{row.them}</td>
                <td className="p-4">{row.us}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 leading-relaxed text-ocean-muted">{comparison.closing}</p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/docs"
          className="rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
        >
          Install NemoMemo
        </Link>
        <a
          href={DEMO_URL}
          className="rounded-xl border border-ocean-border bg-ocean-card px-5 py-2.5 font-bold transition-colors hover:border-ocean-primary"
        >
          {DEMO_LABEL}
        </a>
      </div>
    </div>
  );
}
