import Link from 'next/link';
import {
  AnglerMark,
  Bubbles,
  CoralSilhouette,
  DepthMarker,
  JellyfishMark,
  SeagrassSilhouette,
  TinyFish,
  WaveEdge,
} from '@/components/sea-life';
import { DEMO_LABEL, DEMO_URL } from '@/lib/demo-url';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'Features',
  description:
    'Everything in NemoMemo, by depth: Markdown capture with inline tags, filter expressions and saved views, per-memo sharing, comments and reactions, 24-hour Dory memos, and single-container self-hosting.',
  path: '/features',
});

interface Zone {
  depth: string;
  title: string;
  blurb: string;
  bg: string;
  ink: string;
  items: { name: string; body: string }[];
}

const ZONES: Zone[] = [
  {
    depth: '0 m · the sunlit surface',
    title: 'Capture',
    blurb: 'Get the thought down before it swims off.',
    bg: 'oklch(0.7 0.085 215)',
    ink: 'oklch(0.2 0.04 250)',
    items: [
      { name: 'Markdown editor', body: 'CodeMirror-powered box with a formatting toolbar, drafts that survive reloads, and ⌘+Enter to save.' },
      { name: 'Inline tags', body: 'Type #reef or nested #dev/docker anywhere — tags are extracted automatically, no management screen.' },
      { name: 'Attachments', body: 'Paste screenshots or drop files straight into the editor.' },
      { name: 'Task lists', body: 'Checkboxes you can tick right in the rendered memo — the source updates itself.' },
      { name: 'Dory memos', body: 'Opt a memo into 24-hour forgetting with one click of the little blue tang.' },
    ],
  },
  {
    depth: '15 m · the reef',
    title: 'Find it again',
    blurb: 'Or watch it go — that part is up to you.',
    bg: 'oklch(0.48 0.085 232)',
    ink: 'oklch(0.97 0.01 240)',
    items: [
      { name: 'Filter expressions', body: 'One language everywhere: tag in ["work"] && has_incomplete_tasks. Search chips, saved views, and the API all speak it.' },
      { name: 'Saved views', body: 'Name a filter and pin it to your sidebar, with a Validate button and example gallery.' },
      { name: 'Calendar heatmap', body: 'Your writing streak at a glance; click a day to filter to it.' },
      { name: '⌘K search', body: 'Type words, get memos. Each word becomes a chip.' },
      { name: 'Pin & archive', body: 'Pins float to the top. The archive is the treasure chest even Dory cannot touch.' },
    ],
  },
  {
    depth: '40 m · open water',
    title: 'Share the reef',
    blurb: 'Publish exactly as much as you mean to, to exactly who you mean to.',
    bg: 'oklch(0.33 0.06 245)',
    ink: 'oklch(0.95 0.012 240)',
    items: [
      { name: 'Three visibilities', body: 'Private, protected (any signed-in member), or public — per memo.' },
      { name: 'Share links', body: 'Tokenized links that work without an account, expiring in 1, 7, 30 days, or never.' },
      { name: 'Explore feed', body: 'The shared timeline of your whole reef.' },
      { name: 'Comments & reactions', body: 'Full Markdown comments and an admin-curated emoji set (🐠 and 🫧 included).' },
      { name: 'Mentions', body: '@username notifies people in their inbox.' },
      { name: 'Profiles & members', body: 'Every member gets a public page; admins invite, archive, and restore accounts.' },
    ],
  },
  {
    depth: '200 m · the deep',
    title: 'Own the water',
    blurb: 'It runs on your hardware and answers to you.',
    bg: 'oklch(0.19 0.04 255)',
    ink: 'oklch(0.92 0.012 240)',
    items: [
      { name: 'Single container', body: 'One docker run, one data volume: SQLite + uploads.' },
      { name: 'Zero telemetry', body: 'Nothing phones home. Ever.' },
      { name: 'Source-available', body: 'Read it, fork it, self-host it free forever (ELv2).' },
      { name: 'REST API', body: 'Everything the app does is a JSON endpoint you can script.' },
    ],
  },
];

const SEAFLOOR_BG = 'oklch(0.145 0.032 258)';

function ZoneScenery({ index }: { index: number }) {
  if (index === 0) {
    return (
      <>
        <div className="animate-drift pointer-events-none absolute right-10 top-10 flex gap-3 opacity-50 sm:right-24" aria-hidden>
          <TinyFish className="h-3 w-6" />
          <TinyFish className="h-3 w-6 -translate-y-2" />
          <TinyFish className="h-2.5 w-5 translate-y-1" />
        </div>
        <Bubbles className="pointer-events-none absolute left-8 top-16 h-20 w-10 opacity-60 sm:left-20" />
      </>
    );
  }
  if (index === 1) {
    return (
      <>
        <CoralSilhouette className="pointer-events-none absolute -bottom-1 left-4 h-20 w-24 sm:left-16" fill="oklch(0.36 0.08 20 / 0.6)" />
        <SeagrassSilhouette className="animate-sway pointer-events-none absolute -bottom-1 right-6 h-20 w-14 origin-bottom sm:right-24" fill="oklch(0.4 0.08 170 / 0.55)" />
      </>
    );
  }
  if (index === 2) {
    return (
      <JellyfishMark className="animate-float pointer-events-none absolute right-10 top-14 h-24 w-[4.5rem] opacity-80 sm:right-28" />
    );
  }
  return (
    <Bubbles className="pointer-events-none absolute left-10 top-12 h-16 w-9 opacity-30 sm:left-28" />
  );
}

export default function FeaturesPage() {
  return (
    <div>
      {/* Dive-in header */}
      <section className="relative overflow-hidden bg-gradient-to-b from-ocean-abyss to-[oklch(0.42_0.07_225)] pt-16 text-center">
        <div className="px-4">
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Everything in the reef</h1>
          <p className="mx-auto mt-3 max-w-md text-lg text-ocean-muted">
            Deliberately small — and arranged by depth. Take the dive.
          </p>
          <p className="mt-8 font-mono text-xs font-bold uppercase tracking-[0.3em] opacity-60">
            descend ▾
          </p>
        </div>
        <WaveEdge fill={ZONES[0].bg} className="mt-10" />
      </section>

      {ZONES.map((zone, index) => (
        <section
          key={zone.title}
          className="relative overflow-hidden"
          style={{ backgroundColor: zone.bg, color: zone.ink }}
        >
          <ZoneScenery index={index} />
          <div className="mx-auto w-full max-w-4xl px-4 pb-4 pt-14 sm:pt-16">
            <DepthMarker depth={zone.depth} />
            <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">{zone.title}</h2>
            <p className="mt-1.5 max-w-md text-lg opacity-75">{zone.blurb}</p>
            <div className="mt-10 grid gap-x-16 gap-y-8 pb-16 sm:grid-cols-2">
              {zone.items.map((item, itemIndex) => (
                <div
                  key={item.name}
                  className={`flex gap-4 ${itemIndex % 2 === 1 ? 'sm:translate-y-8' : ''}`}
                >
                  <svg viewBox="0 0 20 20" className="mt-1 size-4 shrink-0 opacity-70" aria-hidden>
                    <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
                    <circle cx="10" cy="10" r="3" fill="currentColor" />
                  </svg>
                  <div>
                    <p className="font-display text-lg font-bold">{item.name}</p>
                    <p className="mt-1 text-[15px] leading-relaxed opacity-75">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <WaveEdge fill={index < ZONES.length - 1 ? ZONES[index + 1].bg : SEAFLOOR_BG} />
        </section>
      ))}

      {/* Seafloor */}
      <section
        className="relative overflow-hidden px-4 pb-20 pt-10 text-center"
        style={{ backgroundColor: SEAFLOOR_BG, color: 'oklch(0.9 0.012 240)' }}
      >
        <AnglerMark className="animate-float mx-auto h-20 w-24" />
        <h2 className="mt-6 font-display text-3xl font-bold">You&apos;ve reached the seafloor.</h2>
        <p className="mx-auto mt-2 max-w-sm text-[15px] opacity-70">
          That&apos;s the whole feature list — no darker depths, no hidden &ldquo;Pro&rdquo; trench.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/docs"
            className="rounded-xl bg-ocean-primary px-6 py-3 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
          >
            Install NemoMemo
          </Link>
          <a
            href={DEMO_URL}
            className="rounded-xl border border-[oklch(0.32_0.05_252)] px-6 py-3 font-bold transition-colors hover:border-ocean-primary"
          >
            {DEMO_LABEL}
          </a>
        </div>
      </section>
    </div>
  );
}
