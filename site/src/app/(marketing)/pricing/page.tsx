import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { DoryMark } from '@/components/dory-mark';
import { Bubbles, TinyFish, WaveEdge } from '@/components/sea-life';
import { CLOUD_LIVE, CLOUD_URL, DEMO_LABEL, DEMO_URL } from '@/lib/demo-url';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'Pricing',
  description: CLOUD_LIVE
    ? 'NemoMemo is free to self-host, forever. Rather not run a server? A hosted reef is $1.99/month or $19/year — updates, backups, and TLS included.'
    : 'NemoMemo is free to self-host, forever — no tiers, no seats, no metering. You pay only for wherever you run it.',
  path: '/pricing',
});

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-4.5 shrink-0" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.5" />
      <path d="M6 10.5 9 13.5 14.5 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-left text-sm leading-relaxed">
      <Check />
      <span>{children}</span>
    </li>
  );
}

function OpenOceanCard() {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-ocean-border bg-gradient-to-b from-[oklch(0.27_0.05_248)] to-[oklch(0.22_0.045_252)] p-8">
      <div className="animate-drift pointer-events-none absolute right-6 top-6 flex gap-2 text-ocean-blue opacity-50" aria-hidden>
        <TinyFish className="h-2.5 w-5" />
        <TinyFish className="h-2.5 w-5 -translate-y-1.5" />
      </div>
      <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ocean-blue">
        The open ocean
      </p>
      <p className="mt-1 font-display text-xl font-bold">Captain your own ship</p>
      <p className="mt-4 font-display text-5xl font-extrabold">$0</p>
      <p className="mt-1 text-sm text-ocean-muted">forever, for everyone, for everything</p>
      <ul className="mt-6 flex flex-col gap-2.5">
        <PlanItem>Unlimited memos, members, and tags</PlanItem>
        <PlanItem>Every feature, including Dory</PlanItem>
        <PlanItem>The whole source code, free to self-host (ELv2)</PlanItem>
        <PlanItem>Your data, on your hardware</PlanItem>
      </ul>
      <Link href="/docs" className="mt-auto pt-8">
        <span className="inline-block w-full rounded-xl border-2 border-ocean-primary px-5 py-2.5 text-center font-bold text-ocean-primary transition-colors hover:bg-ocean-primary hover:text-ocean-on-primary">
          Install NemoMemo
        </span>
      </Link>
    </div>
  );
}

function LagoonCard() {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border-2 border-ocean-primary bg-gradient-to-b from-[oklch(0.32_0.06_230)] to-[oklch(0.26_0.06_250)] p-8">
      <DoryMark className="animate-float pointer-events-none absolute right-6 top-5 h-12 w-[4.25rem] opacity-90" />
      <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ocean-dory">
        The lagoon
      </p>
      <p className="mt-1 font-display text-xl font-bold">We&apos;ll host your reef</p>
      <p className="mt-4 font-display text-5xl font-extrabold">
        $1.99<span className="text-lg font-bold text-ocean-muted">/mo</span>
      </p>
      <p className="mt-1 text-sm text-ocean-muted">
        or <span className="font-bold text-ocean-ink">$19/year</span> — two months free
      </p>
      <ul className="mt-6 flex flex-col gap-2.5">
        <PlanItem>Your own private reef at your-name.trynemomemo.com</PlanItem>
        <PlanItem>We run it, update it, and back it up nightly</PlanItem>
        <PlanItem>Every feature, including Dory</PlanItem>
        <PlanItem>Ready in about 60 seconds after checkout</PlanItem>
      </ul>
      <div className="mt-auto flex flex-col gap-2 pt-8">
        <a
          href={`${CLOUD_URL}/cloud/checkout?interval=month`}
          className="inline-block w-full rounded-xl bg-ocean-primary px-5 py-2.5 text-center font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
        >
          Get your reef — $1.99/mo
        </a>
        <a
          href={`${CLOUD_URL}/cloud/checkout?interval=year`}
          className="inline-block w-full rounded-xl border border-ocean-primary px-5 py-2 text-center text-sm font-bold text-ocean-primary transition-colors hover:bg-ocean-primary hover:text-ocean-on-primary"
        >
          Or $19/year
        </a>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div>
      {CLOUD_LIVE ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'NemoMemo Cloud',
            description:
              'A hosted NemoMemo instance at your own subdomain — updated, backed up, and run for you.',
            brand: { '@type': 'Brand', name: 'NemoMemo' },
            offers: [
              { '@type': 'Offer', price: '1.99', priceCurrency: 'USD', description: 'Monthly' },
              { '@type': 'Offer', price: '19', priceCurrency: 'USD', description: 'Yearly' },
            ],
          }}
        />
      ) : null}

      <section className="relative overflow-hidden bg-gradient-to-b from-ocean-abyss to-ocean-bg px-4 pt-16 text-center">
        <Bubbles className="pointer-events-none absolute left-[12%] top-10 h-16 w-9 text-ocean-blue opacity-40" />
        <Bubbles className="pointer-events-none absolute right-[10%] top-20 h-14 w-8 text-ocean-blue opacity-30" />
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
          {CLOUD_LIVE ? 'Choose your waters.' : 'Free. As in fish.'}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-ocean-muted">
          {CLOUD_LIVE
            ? 'The software is the same either way — full source, every feature, no tiers. The only question is who carries the server.'
            : 'NemoMemo costs $0 — no tiers, no seats, no metered API, no "Pro" button waiting to ambush you. It is source-available software you run yourself.'}
        </p>
        <div className="h-10" />
      </section>

      <section
        id="cloud"
        className={`mx-auto w-full scroll-mt-20 px-4 ${
          CLOUD_LIVE ? 'grid max-w-3xl gap-6 sm:grid-cols-2' : 'max-w-sm'
        }`}
      >
        <OpenOceanCard />
        {CLOUD_LIVE ? <LagoonCard /> : null}
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 pb-16">
        {CLOUD_LIVE ? (
          <div className="mt-8 rounded-2xl border border-ocean-border bg-ocean-card p-6 text-left">
            <p className="font-display font-bold">The Cloud fine print, in plain water</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ocean-muted">
              <li>
                🐠 <strong className="text-ocean-ink">Try before you buy</strong>: the{' '}
                <a href={DEMO_URL} className="font-semibold text-ocean-primary hover:underline">
                  {DEMO_LABEL.toLowerCase()}
                </a>{' '}
                is the trial. Checkout first, then claim your reef.
              </li>
              <li>
                💳 <strong className="text-ocean-ink">14-day refunds</strong>, no questions asked —
                and you can cancel anytime from the billing portal in your reef&apos;s Settings.
              </li>
              <li>
                📦 <strong className="text-ocean-ink">Fair use</strong>: unlimited memos; up to 25
                members and 5 GB of attachments per reef. Need more? Ask — these are abuse brakes,
                not upsells.
              </li>
              <li>
                🛟 <strong className="text-ocean-ink">Community support</strong> via GitHub
                Discussions. Your reef&apos;s data is backed up nightly and yours to export.
              </li>
            </ul>
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border border-ocean-border bg-ocean-card p-6 text-left">
          <p className="font-display font-bold">The honest costs of self-hosting</p>
          <p className="mt-2 text-sm leading-relaxed text-ocean-muted">
            Self-hosting isn&apos;t literally free: you&apos;ll want a machine to run it on (a $5
            VPS, a Raspberry Pi, or the laptop in your closet), optionally a domain, and a backup
            habit for one SQLite file and an uploads folder. That&apos;s the entire bill.
          </p>
        </div>
      </div>

      <WaveEdge fill="oklch(0.17 0.04 255)" />
      <section className="bg-[oklch(0.17_0.04_255)] px-4 pb-16 pt-8 text-center">
        <p className="font-display text-xl font-bold">Not sure which water is yours?</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ocean-muted">
          Start self-hosted — it&apos;s free, and a hosted reef can always come later. Your notes
          export as plain Markdown either way, so nothing is ever stranded.
        </p>
      </section>
    </div>
  );
}
