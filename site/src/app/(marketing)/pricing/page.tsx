import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 text-center">
      <h1 className="font-display text-4xl font-bold">Free. As in fish.</h1>
      <p className="mt-3 text-lg text-ocean-muted">
        NemoMemo costs $0 — no tiers, no seats, no metered API, no &ldquo;Pro&rdquo; button waiting to
        ambush you. It is MIT-licensed software you run yourself.
      </p>

      <div className="mx-auto mt-8 max-w-sm rounded-2xl border-2 border-ocean-primary bg-ocean-card p-8">
        <p className="font-display text-5xl font-bold">$0</p>
        <p className="mt-1 text-sm text-ocean-muted">forever, for everyone, for everything</p>
        <ul className="mt-5 flex flex-col gap-2 text-left text-sm">
          <li>✅ Unlimited memos, members, and tags</li>
          <li>✅ Every feature, including Dory</li>
          <li>✅ The whole source code</li>
          <li>✅ Your data, on your hardware</li>
        </ul>
        <Link
          href="/docs"
          className="mt-6 inline-block w-full rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-white transition-opacity hover:opacity-90"
        >
          Install NemoMemo
        </Link>
      </div>

      <div className="mt-10 rounded-2xl border border-ocean-border bg-ocean-card p-5 text-left">
        <p className="font-display font-bold">The honest costs</p>
        <p className="mt-1.5 text-sm text-ocean-muted">
          Self-hosting isn&apos;t literally free: you&apos;ll want a machine to run it on (a $5 VPS, a
          Raspberry Pi, or the laptop in your closet), optionally a domain, and a backup habit for one
          SQLite file and an uploads folder. That&apos;s the entire bill.
        </p>
      </div>
    </div>
  );
}
