import type { Metadata } from 'next';
import Link from 'next/link';
import { AppPreview } from '@/components/app-preview';
import { DoryMark } from '@/components/dory-mark';
import { JsonLd } from '@/components/json-ld';
import { NemoMark } from '@/components/nemo-mark';
import { CLOUD_LIVE, CLOUD_URL, DEMO_LABEL, DEMO_LIVE, DEMO_URL } from '@/lib/demo-url';
import { OG_IMAGE, SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: 'NemoMemo — Self-hosted notes app that forgets on purpose' },
  description:
    'NemoMemo is a free, self-hosted note-taking app: a private Markdown memo timeline with tags, sharing, and Dory memos that delete themselves after 24 hours. One Docker container, one SQLite file.',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'NemoMemo — Self-hosted notes app that forgets on purpose',
    description:
      'A private Markdown memo timeline on your own server — with Dory memos that forget themselves in 24 hours.',
    url: SITE_URL,
    siteName: 'NemoMemo',
    images: [OG_IMAGE],
  },
};

const FAQ = [
  {
    q: 'Is NemoMemo really free?',
    a: CLOUD_LIVE
      ? 'Yes — free to self-host, forever: full source, no tiers, no seats, no metering (Elastic License 2.0; the one reserved right is reselling it as a hosted service). Rather not run a server? We will host your reef for $1.99/month.'
      : 'Yes — free to self-host, forever: full source, no tiers, no seats, no metering. You pay only for wherever you run it (Elastic License 2.0).',
  },
  {
    q: 'What happens when Dory forgets a memo?',
    a: 'It fades over its final hours, then the server deletes it for good — comments, attachments, and share links included. Archiving a Dory memo rescues it forever.',
  },
  {
    q: 'Is it a good alternative to Google Keep or Notion?',
    a: "For quick capture, yes. NemoMemo is deliberately not a workspace or a second brain — it's a timeline for the notes you'd otherwise lose.",
  },
  {
    q: 'How hard is it to self-host?',
    a: 'One docker run. Data lives in one volume: an SQLite database and your uploads.',
  },
  {
    q: 'How is this related to Memos?',
    a: 'NemoMemo is an independent, fish-obsessed recreation inspired by the excellent open-source Memos project. Go star them.',
  },
];

const DOCKER_COMMAND = `docker run -d -p 5230:5230 \\
  -v nemomemo-data:/app/data \\
  ghcr.io/davidallmon/nemomemo:latest`;

function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-ocean-primary px-6 py-3 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
    >
      {children}
    </Link>
  );
}

function BentoCell({
  className,
  title,
  children,
}: {
  className?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-ocean-border bg-ocean-card p-6 sm:p-7 ${className ?? ''}`}>
      <p className="font-display text-xl font-bold">{title}</p>
      <div className="mt-2 text-sm leading-relaxed text-ocean-muted">{children}</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'NemoMemo',
          applicationCategory: 'ProductivityApplication',
          operatingSystem: 'Self-hosted (Docker); any modern web browser',
          url: SITE_URL,
          description:
            'A self-hosted, Markdown-native memo timeline with tags, sharing, and ephemeral Dory memos that delete themselves after 24 hours.',
          offers: CLOUD_LIVE
            ? [
                { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Self-hosted — free forever' },
                { '@type': 'Offer', price: '1.99', priceCurrency: 'USD', description: 'NemoMemo Cloud, per month' },
              ]
            : [{ '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Self-hosted — free forever' }],
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-ocean-abyss via-ocean-bg to-ocean-bg">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pt-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-ocean-blue-soft bg-ocean-card px-3.5 py-1.5 text-xs font-bold text-ocean-blue sm:text-[13px]">
            Self-hosted · source-available · one container
          </div>
          <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold leading-[1.08] sm:text-6xl">
            Write it down.
            <br />
            Or let <span className="text-ocean-dory">Dory</span> forget it.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ocean-muted sm:text-xl">
            The self-hosted notes app for quick capture — Markdown-native, one SQLite file, and Dory
            memos that forget themselves in 24 hours.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PrimaryCta href="/docs">Install NemoMemo</PrimaryCta>
            <a
              href={DEMO_URL}
              className="rounded-xl border border-ocean-border bg-ocean-card px-6 py-3 font-bold transition-colors hover:border-ocean-primary"
            >
              {DEMO_LABEL}
            </a>
          </div>
          {CLOUD_LIVE ? (
            <p className="mt-4 text-sm font-bold text-ocean-muted">
              Free to self-host, forever — or{' '}
              <Link href="/pricing#cloud" className="text-ocean-dory hover:underline">
                we&apos;ll host your reef for $1.99/mo ↓
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-sm font-bold text-ocean-muted">Free to self-host, forever.</p>
          )}
          {DEMO_LIVE ? (
            <p className="mt-1.5 text-xs text-ocean-muted/80">
              Demo login: <code className="font-bold">demo</code> /{' '}
              <code className="font-bold">justkeepswimming</code> — resets every 24 hours.
            </p>
          ) : null}
          <div className="mt-12 w-full max-w-4xl">
            <AppPreview />
          </div>
        </div>
      </section>

      {/* Bento */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">Small on purpose.</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-lg text-ocean-muted">
          Not a workspace. Not a second brain. A timeline for the notes you&apos;d otherwise lose.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-2xl border border-ocean-border bg-gradient-to-br from-[oklch(0.26_0.05_252)] to-[oklch(0.24_0.07_255)] p-6 sm:col-span-2 sm:p-8 lg:col-span-4">
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div className="max-w-sm">
                <p className="font-display text-2xl font-bold">Dory memos forget for you</p>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ocean-muted">
                  Parking spots. Confirmation codes. Mark a memo and it fades out over 24 hours, then
                  it&apos;s gone — attachments, share links and all. Archive it to rescue it forever.
                </p>
              </div>
              <div className="flex flex-col items-center gap-2.5">
                <DoryMark className="h-16 w-24" />
                <span className="inline-flex items-center gap-1 rounded-full border border-ocean-dory/60 bg-[oklch(0.22_0.04_255)] px-3 py-1 text-[13px] font-extrabold text-ocean-dory">
                  🐟 forgets in 23h
                </span>
              </div>
            </div>
          </div>
          <BentoCell className="lg:col-span-2" title="One command">
            <p>One container, one volume. Happy on a Raspberry Pi.</p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-ocean-border bg-[oklch(0.16_0.03_252)] p-3 font-mono text-xs leading-relaxed text-[oklch(0.85_0.05_160)]">
              <code>{DOCKER_COMMAND}</code>
            </pre>
          </BentoCell>
          <BentoCell className="lg:col-span-2" title="Plain Markdown, forever">
            <p>
              Tasks, tables, code blocks, inline #tags. Portable text — never a proprietary format.
            </p>
          </BentoCell>
          <BentoCell className="lg:col-span-2" title="One SQLite file">
            <p>
              Your server, your database, your uploads folder. Zero telemetry. That&apos;s the whole
              footprint.
            </p>
          </BentoCell>
          <BentoCell className="lg:col-span-2" title="A reef, not a silo">
            <p>
              Per-memo visibility, comments, reactions, mentions, and share links that expire with
              the memo.
            </p>
          </BentoCell>
        </div>
      </section>

      {/* Hosted reef (Cloud) */}
      {CLOUD_LIVE ? (
        <section id="cloud" className="mx-auto w-full max-w-6xl px-4 pb-20">
          <div className="flex flex-col items-start gap-10 rounded-2xl border border-[oklch(0.36_0.06_235)] bg-gradient-to-br from-[oklch(0.24_0.05_245)] to-[oklch(0.26_0.06_255)] p-8 lg:flex-row lg:items-center lg:p-11">
            <div className="max-w-lg">
              <p className="text-[13px] font-extrabold tracking-wider text-ocean-blue">
                SELF-HOSTING IS FREE, FOREVER
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold">
                Rather not carry a server? We&apos;ll host your reef.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ocean-muted">
                Same software, same Dory — at{' '}
                <code className="font-mono text-sm text-ocean-ink">your-name.trynemomemo.com</code>,
                updated and backed up by us. Writing memos about 60 seconds after you sign up, and
                your notes export as plain Markdown either way.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <a
                  href={`${CLOUD_URL}/cloud/checkout?interval=month`}
                  className="rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
                >
                  Get a hosted reef
                </a>
                <Link href="/docs/cloud" className="text-sm font-bold text-ocean-blue hover:underline">
                  How Cloud works →
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap gap-3.5 lg:ml-auto">
              <div className="w-56 rounded-xl border border-ocean-border bg-ocean-bg/60 p-5">
                <p className="text-xs font-extrabold tracking-wider text-ocean-muted">RUN IT YOURSELF</p>
                <p className="mt-2 font-display text-2xl font-bold">
                  ~$5<span className="text-sm font-bold text-ocean-muted">/mo VPS</span>
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ocean-muted">
                  Or $0 on hardware you already own — plus updates, backups, and TLS on you.
                </p>
              </div>
              <div className="w-56 rounded-xl border border-ocean-dory/60 bg-[oklch(0.24_0.06_255_/_0.7)] p-5">
                <p className="text-xs font-extrabold tracking-wider text-ocean-dory">WE RUN IT FOR YOU</p>
                <p className="mt-2 font-display text-2xl font-bold">
                  $1.99<span className="text-sm font-bold text-ocean-muted">/mo</span>
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ocean-muted">
                  Or $19/year. Updates, backups, and TLS on us. Cancel anytime.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Compare strip */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20">
        <div className="grid overflow-hidden rounded-2xl border border-ocean-border sm:grid-cols-3">
          {[
            {
              label: 'VS. NOTION',
              body: 'A workspace asks you to build. NemoMemo asks you to type one line and leave.',
              href: '/compare/notion',
            },
            {
              label: 'VS. GOOGLE KEEP',
              body: 'Just as fast — but on your server, in plain Markdown you can take anywhere.',
              href: '/compare/google-keep',
            },
            {
              label: 'VS. MEMOS',
              body: 'Our inspiration — and excellent. We add Dory memos and a lot of fish.',
              href: '/compare/memos',
            },
          ].map((cell, index) => (
            <Link
              key={cell.label}
              href={cell.href}
              className={`group p-7 transition-colors hover:bg-ocean-card ${
                index < 2 ? 'border-b border-ocean-border sm:border-b-0 sm:border-r' : ''
              }`}
            >
              <p className="text-[13px] font-extrabold tracking-wider text-ocean-muted">{cell.label}</p>
              <p className="mt-2.5 text-[15px] leading-relaxed">{cell.body}</p>
              <p className="mt-3 text-sm font-bold text-ocean-blue opacity-0 transition-opacity group-hover:opacity-100">
                Read the comparison →
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-3xl px-4 pb-20">
        <h2 className="text-center font-display text-3xl font-bold">Before you dive in</h2>
        <div className="mt-8 flex flex-col gap-4">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-2xl border border-ocean-border bg-ocean-card p-5">
              <p className="font-display font-bold">{item.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ocean-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-ocean-border bg-ocean-abyss py-20 text-center">
        <NemoMark bob className="mx-auto size-14" />
        <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Start with one memo.</h2>
        <p className="mt-2 text-ocean-muted">It doesn&apos;t even have to be a keeper.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3 px-4">
          <PrimaryCta href="/docs">Install NemoMemo</PrimaryCta>
          <a
            href={DEMO_URL}
            className="rounded-xl border border-ocean-border bg-ocean-card px-6 py-3 font-bold transition-colors hover:border-ocean-primary"
          >
            {DEMO_LABEL}
          </a>
        </div>
      </section>
    </>
  );
}
