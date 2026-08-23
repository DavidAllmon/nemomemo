import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { CLOUD_LIVE, CLOUD_URL, DEMO_LABEL, DEMO_URL } from '@/lib/demo-url';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'Pricing',
  description: CLOUD_LIVE
    ? 'NemoMemo is free to self-host, forever. Rather not run a server? A hosted reef is $1.99/month or $19/year — updates, backups, and TLS included.'
    : 'NemoMemo is free to self-host, forever — no tiers, no seats, no metering. You pay only for wherever you run it.',
  path: '/pricing',
});

function SelfHostCard() {
  return (
    <div className="flex flex-col rounded-2xl border-2 border-ocean-border bg-ocean-card p-8 text-center">
      <p className="font-display font-bold text-ocean-muted">Self-host</p>
      <p className="mt-2 font-display text-5xl font-bold">$0</p>
      <p className="mt-1 text-sm text-ocean-muted">forever, for everyone, for everything</p>
      <ul className="mt-5 flex flex-col gap-2 text-left text-sm">
        <li>✅ Unlimited memos, members, and tags</li>
        <li>✅ Every feature, including Dory</li>
        <li>✅ The whole source code, free to self-host (ELv2)</li>
        <li>✅ Your data, on your hardware</li>
      </ul>
      <Link
        href="/docs"
        className="mt-auto pt-6"
      >
        <span className="inline-block w-full rounded-xl border-2 border-ocean-primary px-5 py-2.5 font-bold text-ocean-primary transition-colors hover:bg-ocean-primary hover:text-ocean-on-primary">
          Install NemoMemo
        </span>
      </Link>
    </div>
  );
}

function CloudCard() {
  return (
    <div className="flex flex-col rounded-2xl border-2 border-ocean-primary bg-ocean-card p-8 text-center">
      <p className="font-display font-bold text-ocean-primary">Hosted reef</p>
      <p className="mt-2 font-display text-5xl font-bold">
        $1.99<span className="text-lg text-ocean-muted">/mo</span>
      </p>
      <p className="mt-1 text-sm text-ocean-muted">
        or <span className="font-bold text-ocean-ink">$19/year</span> — two months free
      </p>
      <ul className="mt-5 flex flex-col gap-2 text-left text-sm">
        <li>✅ Your own private reef at your-name.trynemomemo.com</li>
        <li>✅ We run it, update it, and back it up nightly</li>
        <li>✅ Every feature, including Dory</li>
        <li>✅ Ready in about 60 seconds after checkout</li>
      </ul>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <a
          href={`${CLOUD_URL}/cloud/checkout?interval=month`}
          className="inline-block w-full rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
        >
          Get your reef — $1.99/mo
        </a>
        <a
          href={`${CLOUD_URL}/cloud/checkout?interval=year`}
          className="inline-block w-full rounded-xl border border-ocean-primary px-5 py-2 text-sm font-bold text-ocean-primary transition-colors hover:bg-ocean-primary hover:text-ocean-on-primary"
        >
          Or $19/year
        </a>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center">
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
      <h1 className="font-display text-4xl font-bold">
        {CLOUD_LIVE ? 'Free to self-host. Cheap to let us host.' : 'Free. As in fish.'}
      </h1>
      <p className="mt-3 text-lg text-ocean-muted">
        {CLOUD_LIVE
          ? 'NemoMemo is source-available software you can run yourself for $0 — or we can run a private reef for you for less than a coffee.'
          : 'NemoMemo costs $0 — no tiers, no seats, no metered API, no "Pro" button waiting to ambush you. It is source-available software you run yourself.'}
      </p>

      <div
        id="cloud"
        className={
          CLOUD_LIVE ? 'mx-auto mt-8 grid max-w-2xl gap-6 sm:grid-cols-2' : 'mx-auto mt-8 max-w-sm'
        }
      >
        <SelfHostCard />
        {CLOUD_LIVE ? <CloudCard /> : null}
      </div>

      {CLOUD_LIVE ? (
        <div className="mt-8 rounded-2xl border border-ocean-border bg-ocean-card p-5 text-left">
          <p className="font-display font-bold">The Cloud fine print, in plain water</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ocean-muted">
            <li>
              🐠 <strong>Try before you buy</strong>: the{' '}
              <a href={DEMO_URL} className="font-semibold text-ocean-primary hover:underline">
                {DEMO_LABEL.toLowerCase()}
              </a>{' '}
              is the trial. Checkout first, then claim your reef.
            </li>
            <li>
              💳 <strong>14-day refunds</strong>, no questions asked — and you can cancel anytime from
              the billing portal in your reef&apos;s Settings.
            </li>
            <li>
              📦 <strong>Fair use</strong>: unlimited memos; up to 25 members and 5 GB of attachments
              per reef. Need more? Ask — these are abuse brakes, not upsells.
            </li>
            <li>
              🛟 <strong>Community support</strong> via GitHub Discussions. Your reef&apos;s data is
              backed up nightly and yours to export.
            </li>
          </ul>
        </div>
      ) : null}

      <div className="mt-10 rounded-2xl border border-ocean-border bg-ocean-card p-5 text-left">
        <p className="font-display font-bold">The honest costs of self-hosting</p>
        <p className="mt-1.5 text-sm text-ocean-muted">
          Self-hosting isn&apos;t literally free: you&apos;ll want a machine to run it on (a $5 VPS, a
          Raspberry Pi, or the laptop in your closet), optionally a domain, and a backup habit for one
          SQLite file and an uploads folder. That&apos;s the entire bill.
        </p>
      </div>
    </div>
  );
}
