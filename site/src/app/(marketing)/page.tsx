import type { Metadata } from 'next';
import Link from 'next/link';
import { DoryMark } from '@/components/dory-mark';
import { JsonLd } from '@/components/json-ld';
import { MemoLife } from '@/components/memo-life';
import { CopyCommand } from '@/components/terminal/copy-command';
import { OceanCanvas } from '@/components/terminal/ocean-canvas';
import { formatPostDate, getSortedPosts } from '@/lib/blog';
import { CLOUD_LIVE, CLOUD_URL, DEMO_LIVE, DEMO_URL, REPO_URL } from '@/lib/demo-url';
import { OG_IMAGE, SITE_URL } from '@/lib/site';
import { APP_VERSION } from '@/lib/version';

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

const DOCKER_COMMAND = `docker run -d -p 5230:5230 \\
  -v nemomemo-data:/app/data \\
  ghcr.io/davidallmon/nemomemo:latest`;

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

const FEATURES: { name: string; body: string; dory?: boolean }[] = [
  { name: 'markdown editor', body: 'toolbar, drafts that survive reloads, ⌘+Enter to save' },
  { name: 'inline #tags', body: 'nested like #dev/docker — extracted automatically' },
  { name: 'task lists', body: 'tick checkboxes right in the rendered memo' },
  { name: 'attachments', body: 'paste screenshots or drop files into the editor' },
  { name: 'dory memos', body: '24-hour self-deletion; archive rescues forever', dory: true },
  { name: 'filter language', body: 'tag in ["work"] && has_incomplete_tasks — everywhere' },
  { name: 'saved views', body: 'name a filter, pin it to your sidebar' },
  { name: 'calendar heatmap', body: 'your writing streak at a glance; click a day to filter' },
  { name: '⌘K search', body: 'type words, get memos — each word becomes a chip' },
  { name: 'pin & archive', body: 'pins float to the top; the archive is Dory-proof' },
  { name: 'three visibilities', body: 'private, protected, or public — per memo' },
  { name: 'share links', body: 'work without an account; expire in 1, 7, 30 days, or never' },
  { name: 'explore feed', body: 'the shared timeline of your whole reef' },
  { name: 'comments & reactions', body: 'full Markdown comments; curated emoji (🐠 🫧 included)' },
  { name: 'mentions & inbox', body: '@username notifies people; every member gets a profile' },
  { name: 'one container', body: 'one docker run, one volume: SQLite + uploads' },
  { name: 'zero telemetry', body: 'nothing phones home. ever.' },
  { name: 'REST API + source', body: 'script everything; free to self-host forever (ELv2)' },
];

const COMPARE_ROWS = [
  { label: 'notes live on', nemo: 'your server', notion: 'their cloud', keep: "google's cloud", obsidian: 'local files' },
  { label: 'format', nemo: 'plain markdown', notion: 'proprietary blocks', keep: 'proprietary', obsidian: 'markdown' },
  { label: 'capture cost', nemo: 'type and go', notion: 'pick a page & structure', keep: 'type and go', obsidian: 'open the vault' },
  { label: 'self-forgetting', nemo: '✓ dory, 24h', notion: '—', keep: '—', obsidian: '—' },
  { label: 'price', nemo: 'free to self-host', notion: 'free tier, paid plans', keep: 'free', obsidian: 'free core, paid sync' },
];

function AsciiWave({ withFish }: { withFish?: boolean }) {
  const segment = withFish
    ? '≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ ><((°> ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ '
    : '≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ ';
  return (
    <div className="term-wave font-mono text-sm text-[oklch(0.48_0.06_230)]" aria-hidden>
      <span>
        {segment}
        {segment}
      </span>
    </div>
  );
}

function SectionTag({ id, label, note }: { id?: string; label: string; note?: string }) {
  return (
    <p id={id} className="scroll-mt-24 font-mono text-[13px]" data-reveal>
      <span className="font-bold text-ocean-primary">## {label}</span>
      {note ? <span className="text-ocean-muted"> — {note}</span> : null}
    </p>
  );
}

export default function HomePage() {
  const posts = getSortedPosts().slice(0, 3);

  return (
    <div className="relative">
      <OceanCanvas />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'NemoMemo',
          applicationCategory: 'ProductivityApplication',
          operatingSystem: 'Self-hosted (Docker); any modern web browser',
          softwareVersion: APP_VERSION,
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

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5">
        {/* ——— Hero ——— */}
        <section className="pt-20 sm:pt-24">
          <p className="font-mono text-[13px] text-ocean-muted" data-reveal>
            $ self-hosted notes <span className="text-ocean-border">//</span> markdown-native{' '}
            <span className="text-ocean-border">//</span> one SQLite file
          </p>
          <h1
            className="mt-6 font-mono text-[44px] font-bold leading-[1.1] tracking-tight sm:text-[64px] lg:text-[72px]"
            data-reveal
          >
            WRITE IT DOWN.
            <br />
            OR LET <span className="text-ocean-dory">DORY</span> FORGET IT
            <span className="term-cursor" aria-hidden />
          </h1>
          <p className="mt-7 max-w-xl font-mono text-[15px] leading-relaxed text-ocean-muted" data-reveal>
            A private timeline for quick notes, logs, links, and snippets. On your server. In plain
            Markdown. With memos that delete themselves after 24 hours — if you ask them to.
          </p>

          <div className="mt-10 max-w-2xl border border-ocean-border bg-ocean-bg/70" data-reveal>
            <div className="flex items-center justify-between border-b border-ocean-border px-4 py-2.5 font-mono text-xs">
              <span className="text-ocean-muted">install — about 2 minutes</span>
              <CopyCommand command={DOCKER_COMMAND.replaceAll(' \\\n  ', ' ')} />
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[14px] leading-loose text-[oklch(0.85_0.05_160)]">
              <code>
                <span className="text-ocean-muted">$</span> {DOCKER_COMMAND}
                {'\n'}
                <span className="text-[oklch(0.72_0.1_160)]">✓ your reef is live at localhost:5230</span>
              </code>
            </pre>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 font-mono text-sm font-semibold" data-reveal>
            <Link
              href="/docs"
              className="border border-ocean-primary px-5 py-2.5 text-ocean-primary transition-colors hover:bg-ocean-primary hover:text-ocean-on-primary"
            >
              [ install guide ]
            </Link>
            <a
              href={DEMO_URL}
              className="border border-ocean-border px-5 py-2.5 transition-colors hover:border-ocean-ink"
            >
              [ live demo ]
            </a>
            {DEMO_LIVE ? (
              <span className="text-xs text-ocean-muted">login: demo / justkeepswimming</span>
            ) : null}
          </div>
          {CLOUD_LIVE ? (
            <p className="mt-4 font-mono text-[13px] text-ocean-muted" data-reveal>
              free to self-host, forever ·{' '}
              <a href="#pricing" className="text-ocean-dory hover:underline">
                hosted reef $1.99/mo ↓
              </a>
            </p>
          ) : (
            <p className="mt-4 font-mono text-[13px] text-ocean-muted" data-reveal>
              free to self-host, forever
            </p>
          )}
          <div className="mt-14">
            <AsciiWave withFish />
          </div>
        </section>

        {/* ——— DORY(1) ——— */}
        <section className="mt-16" data-reveal>
          <div className="flex flex-col border border-ocean-border sm:flex-row">
            <div className="flex-1 p-6 sm:p-8">
              <p className="font-mono text-xs font-bold tracking-[0.25em] text-ocean-dory">
                DORY(1) — EPHEMERAL MEMOS
              </p>
              <div className="mt-5 flex flex-col gap-2.5 font-mono text-[13.5px] leading-relaxed text-ocean-ink">
                <p>
                  <span className="inline-block w-24 text-ocean-muted">SYNOPSIS</span> mark memo →
                  countdown 24h → deleted
                </p>
                <p>
                  <span className="inline-block w-24 text-ocean-muted">SCOPE</span> comments,
                  attachments, share links: all go
                </p>
                <p>
                  <span className="inline-block w-24 text-ocean-muted">RESCUE</span> archive = keep
                  forever <span className="text-ocean-muted">// pin ⟂ dory</span>
                </p>
                <p>
                  <span className="inline-block w-24 text-ocean-muted">TAKEBACKS</span> none after
                  zero. that&apos;s the feature.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 border-t border-ocean-border p-6 sm:w-64 sm:border-l sm:border-t-0">
              <DoryMark className="animate-float h-14 w-20" />
              <p className="font-mono text-xs font-semibold text-ocean-dory">status: forgets in 23h</p>
            </div>
          </div>
        </section>
        {/* ——— The life of a memo ——— */}
        <MemoLife />

        {/* ——— Features ——— */}
        <section className="mt-20">
          <SectionTag id="features" label="FEATURES" note="18 total. no tiers, no hidden 'pro' flag." />
          <div className="mt-5 border border-ocean-border" data-reveal="stagger">
            {FEATURES.map((feature) => (
              <div
                key={feature.name}
                className="grid grid-cols-1 border-b border-ocean-border last:border-b-0 sm:grid-cols-[240px_1fr]"
              >
                <p
                  className={`px-5 pt-3 font-mono text-[13.5px] font-bold sm:py-3 ${
                    feature.dory ? 'text-ocean-dory' : 'text-ocean-ink'
                  }`}
                >
                  {feature.name}
                </p>
                <p className="px-5 pb-3 font-mono text-[13.5px] text-ocean-muted sm:border-l sm:border-ocean-border sm:py-3">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ——— Compare ——— */}
        <section className="mt-20">
          <SectionTag id="compare" label="COMPARE" note="the honest version. sometimes the other tool wins." />
          <div className="mt-5 overflow-x-auto border border-ocean-border" data-reveal>
            <table className="w-full min-w-[640px] border-collapse font-mono text-[13px]">
              <thead>
                <tr className="border-b border-ocean-border text-left">
                  <th className="p-3.5 font-semibold" />
                  <th className="p-3.5 font-bold text-ocean-primary">nemomemo</th>
                  <th className="p-3.5 font-semibold text-ocean-muted">notion</th>
                  <th className="p-3.5 font-semibold text-ocean-muted">keep</th>
                  <th className="p-3.5 font-semibold text-ocean-muted">obsidian</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-ocean-border last:border-b-0">
                    <td className="p-3.5 font-semibold">{row.label}</td>
                    <td className={`p-3.5 ${row.label === 'self-forgetting' ? 'text-ocean-dory' : ''}`}>
                      {row.nemo}
                    </td>
                    <td className="p-3.5 text-ocean-muted">{row.notion}</td>
                    <td className="p-3.5 text-ocean-muted">{row.keep}</td>
                    <td className="p-3.5 text-ocean-muted">{row.obsidian}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 font-mono text-[13px] text-ocean-muted" data-reveal>
            deep dives: <Link href="/compare/memos" className="text-ocean-blue hover:underline">vs memos</Link> ·{' '}
            <Link href="/compare/notion" className="text-ocean-blue hover:underline">vs notion</Link> ·{' '}
            <Link href="/compare/google-keep" className="text-ocean-blue hover:underline">vs keep</Link> ·{' '}
            <Link href="/compare/obsidian" className="text-ocean-blue hover:underline">vs obsidian</Link>{' '}
            <span aria-hidden>&nbsp;&lt;°))&gt;&lt;</span>
          </p>
        </section>

        {/* ——— Pricing ——— */}
        <section className="mt-20">
          <SectionTag id="pricing" label="PRICING" />
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
          <div className="mt-5 flex flex-col border border-ocean-border sm:flex-row" data-reveal>
            <div className="flex-1 p-7 sm:p-9">
              <p className="font-mono text-5xl font-bold">
                $0<span className="ml-2 text-sm font-semibold text-ocean-muted">forever</span>
              </p>
              <p className="mt-4 font-mono text-[13.5px] leading-relaxed text-ocean-muted">
                self-host. every feature. unlimited members.
                <br />
                full source (ELv2). your hardware, your rules.
              </p>
              <Link
                href="/docs"
                className="mt-6 inline-block border border-ocean-primary px-5 py-2 font-mono text-[13px] font-bold text-ocean-primary transition-colors hover:bg-ocean-primary hover:text-ocean-on-primary"
              >
                [ install guide ]
              </Link>
            </div>
            {CLOUD_LIVE ? (
              <div className="flex-1 border-t border-ocean-border p-7 sm:border-l sm:border-t-0 sm:p-9">
                <p className="font-mono text-5xl font-bold text-ocean-dory">
                  $1.99
                  <span className="ml-2 text-sm font-semibold text-ocean-muted">/mo · $19/yr</span>
                </p>
                <p className="mt-4 font-mono text-[13.5px] leading-relaxed text-ocean-muted">
                  optional hosted reef @ your-name.trynemomemo.com.
                  <br />
                  updates + backups + TLS on us. cancel anytime.
                </p>
                <a
                  href={`${CLOUD_URL}/cloud/checkout?interval=month`}
                  className="mt-6 inline-block bg-ocean-primary px-5 py-2 font-mono text-[13px] font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
                >
                  [ get a hosted reef ]
                </a>
              </div>
            ) : null}
          </div>
          {CLOUD_LIVE ? (
            <div className="mt-4 flex flex-col gap-1.5 font-mono text-xs leading-relaxed text-ocean-muted" data-reveal>
              <p>· try before you buy: the live demo is the trial — checkout first, then claim your reef</p>
              <p>· 14-day refunds, no questions asked; cancel anytime from your reef&apos;s billing portal</p>
              <p>· fair use: unlimited memos; 25 members + 5 GB attachments per reef (abuse brakes, not upsells)</p>
              <p>· nightly backups; your notes export as plain Markdown, always</p>
            </div>
          ) : (
            <p className="mt-4 font-mono text-xs leading-relaxed text-ocean-muted" data-reveal>
              · the honest costs: a machine to run it on (a $5 VPS, a Raspberry Pi, or the laptop in
              your closet), optionally a domain, and a backup habit for one SQLite file
            </p>
          )}
        </section>

        {/* ——— FAQ ——— */}
        <section className="mt-20">
          <SectionTag id="faq" label="FAQ" />
          <div className="mt-5 border border-ocean-border" data-reveal="stagger">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-b border-ocean-border last:border-b-0">
                <summary className="flex cursor-pointer list-none items-baseline gap-3 px-5 py-3.5 font-mono text-[13.5px] font-bold [&::-webkit-details-marker]:hidden">
                  <span className="text-ocean-primary transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  {item.q}
                </summary>
                <p className="px-5 pb-4 pl-11 font-mono text-[13px] leading-relaxed text-ocean-muted">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ——— Log ——— */}
        <section className="mt-20">
          <SectionTag id="log" label="LOG" note="$ tail -3 ships.log" />
          <div className="mt-5 flex flex-col gap-2 font-mono text-[14px]" data-reveal="stagger">
            {posts.map((post) => (
              <Link key={post.url} href={post.url} className="group flex flex-wrap items-baseline gap-3">
                <span className="text-xs text-ocean-muted">{post.data.date}</span>
                <span className="font-semibold underline-offset-4 group-hover:underline">
                  {post.data.title.toLowerCase()}
                </span>
              </Link>
            ))}
            <p className="mt-1 text-[13px] text-ocean-muted">
              <Link href="/blog" className="text-ocean-blue hover:underline">
                all entries
              </Link>{' '}
              ·{' '}
              <a href="/feed.xml" className="text-ocean-blue hover:underline">
                rss
              </a>
            </p>
          </div>
        </section>

        {/* ——— Seafloor ——— */}
        <section className="mb-16 mt-24">
          <AsciiWave />
          <div className="mt-10 flex flex-col items-start gap-5" data-reveal>
            <p className="font-mono text-[13px] text-ocean-muted">
              $ echo &quot;you&apos;ve reached the seafloor.&quot;
            </p>
            <p className="font-mono text-3xl font-bold sm:text-4xl">
              Start with one memo.
              <span className="text-ocean-muted"> It doesn&apos;t even have to be a keeper.</span>
            </p>
            <div className="flex flex-wrap gap-4 font-mono text-sm font-semibold">
              <Link
                href="/docs"
                className="bg-ocean-primary px-6 py-3 text-ocean-on-primary transition-opacity hover:opacity-90"
              >
                install nemomemo
              </Link>
              <a
                href={DEMO_URL}
                className="border border-ocean-border px-6 py-3 transition-colors hover:border-ocean-ink"
              >
                try the live demo
              </a>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="self-center text-[13px] text-ocean-muted transition-colors hover:text-ocean-ink"
              >
                read the source ↗
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
