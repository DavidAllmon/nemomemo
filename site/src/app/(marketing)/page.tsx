import Link from 'next/link';
import { NemoMark } from '@/components/nemo-mark';
import { CLOUD_LIVE, DEMO_LABEL, DEMO_URL } from '@/lib/demo-url';

const PRODUCT_CARDS = [
  {
    title: 'Your notes stay with you',
    body: 'Self-hosted on your own machine, NAS, or VPS. SQLite file + uploads folder — that is the whole footprint.',
  },
  {
    title: 'Open, type, move on',
    body: 'No folders, no templates, no title required. The editor is one box that speaks Markdown.',
  },
  {
    title: 'Plain Markdown, forever',
    body: 'Tasks, code blocks, tables, and inline #tags. Your notes are portable text, not a proprietary format.',
  },
  {
    title: 'Dory-powered forgetting',
    body: 'Some thoughts only need to live a day. Mark them and Dory forgets them in 24 hours — automatically.',
  },
  {
    title: 'A reef, not a silo',
    body: 'Invite your people. Visibility per memo, comments, reactions, mentions, and an Explore feed.',
  },
  {
    title: 'Small enough to run anywhere',
    body: 'One container, one volume. Runs happily on a Raspberry Pi or the cheapest VPS you can find.',
  },
];

const PERSONAS = [
  { emoji: '🏠', title: 'Self-hosters', body: 'One container next to the rest of the homelab.' },
  { emoji: '👩‍💻', title: 'Developers', body: 'Snippets, TILs, and command logs with syntax highlighting.' },
  { emoji: '📓', title: 'Journalers', body: 'A dated timeline and a calendar heatmap of your streak.' },
  { emoji: '👨‍👩‍👧', title: 'Families', body: 'A small shared record — protected memos for the household.' },
  { emoji: '🎓', title: 'Students', body: 'Class notes with nested tags like #bio/midterm.' },
  { emoji: '🐟', title: 'The forgetful', body: 'Parking spots and one-day reminders, handled by Dory.' },
];

const FAQ = [
  {
    q: 'Is NemoMemo really free?',
    a: 'Yes. MIT licensed, no tiers, no seats, no metering. You pay only for wherever you run it.',
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

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-16 pt-20 text-center">
        <NemoMark bob className="size-20" />
        <h1 className="mt-6 font-display text-4xl font-bold leading-tight sm:text-5xl">
          Write it down.
          <br />
          Or let <span className="text-ocean-blue">Dory</span> forget it.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ocean-muted">
          A cute, self-hosted timeline for quick notes, logs, links, and snippets. Open it, write in
          Markdown, and move on — and when a thought only needs a day, give it to Dory.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-ocean-muted">
          <span className="rounded-full border border-ocean-border px-3 py-1">Private timeline</span>
          <span className="rounded-full border border-ocean-border px-3 py-1">Markdown-native</span>
          <span className="rounded-full border border-ocean-border px-3 py-1">Self-hosted</span>
          <span className="rounded-full border border-ocean-border px-3 py-1">🐟 24h Dory memos</span>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/docs"
            className="rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-white transition-opacity hover:opacity-90"
          >
            Install NemoMemo
          </Link>
          {CLOUD_LIVE ? (
            <Link
              href="/pricing#cloud"
              className="rounded-xl border-2 border-ocean-primary px-5 py-2.5 font-bold text-ocean-primary transition-colors hover:bg-ocean-primary hover:text-white"
            >
              Get NemoMemo Cloud
            </Link>
          ) : null}
          <a
            href={DEMO_URL}
            className="rounded-xl border border-ocean-border bg-ocean-card px-5 py-2.5 font-bold transition-colors hover:border-ocean-primary"
          >
            {DEMO_LABEL}
          </a>
        </div>
        <div className="mt-4 rounded-xl border border-ocean-blue/30 bg-ocean-blue-soft/50 px-4 py-3 text-sm text-ocean-muted">
          <p>
            Public demo login: <code className="font-bold text-ocean-ink">demo</code> /{' '}
            <code className="font-bold text-ocean-ink">justkeepswimming</code>
          </p>
          <p className="mt-1 text-xs">
            The demo resets every 24 hours and reloads its sample reef.
          </p>
        </div>
      </section>

      {/* The idea */}
      <section className="border-y border-ocean-border bg-ocean-card py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="font-display text-3xl font-bold">Not a workspace. Not a second brain.</h2>
          <p className="mt-3 text-lg text-ocean-muted">
            Just a small, self-hosted reef for the notes you want to capture quickly and keep close —
            or deliberately let go.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="font-display text-lg font-bold">Open. Write. Done.</p>
              <p className="mt-1 text-sm text-ocean-muted">Capture now, organize later — with tags, not folders.</p>
            </div>
            <div>
              <p className="font-display text-lg font-bold">Yours to run.</p>
              <p className="mt-1 text-sm text-ocean-muted">Your server, your SQLite file, zero telemetry.</p>
            </div>
            <div>
              <p className="font-display text-lg font-bold">Allowed to forget.</p>
              <p className="mt-1 text-sm text-ocean-muted">
                The only notes app with a fish that forgets on your behalf.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Product cards */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16">
        <h2 className="text-center font-display text-3xl font-bold">Small on purpose. Cute by default.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_CARDS.map((card) => (
            <div key={card.title} className="rounded-2xl border border-ocean-border bg-ocean-card p-5">
              <p className="font-display font-bold">{card.title}</p>
              <p className="mt-1.5 text-sm text-ocean-muted">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Dory spotlight */}
      <section className="border-y border-ocean-border bg-ocean-blue-soft/50 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <p className="text-4xl">🐟</p>
          <h2 className="mt-2 font-display text-3xl font-bold">Meet Dory memos</h2>
          <p className="mt-3 text-lg text-ocean-muted">
            Parking spots. Confirmation codes. &ldquo;Don&apos;t forget the milk.&rdquo; Thoughts that
            matter for a day and clutter forever. Mark one as a Dory memo and it shows a friendly
            countdown, fades as its time runs out, and is gone in 24 hours. Change your mind? Archive
            it — that rescues it from her memory for good.
          </p>
          <div className="mx-auto mt-6 inline-flex items-center gap-1.5 rounded-full border border-ocean-blue/30 bg-ocean-card px-4 py-1.5 text-sm font-bold text-ocean-blue">
            🐟 forgets in 23h
          </div>
        </div>
      </section>

      {/* Deploy */}
      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h2 className="font-display text-3xl font-bold">Your server. One command.</h2>
        <pre className="mt-6 overflow-x-auto rounded-2xl border border-ocean-border bg-ocean-ink p-5 text-left text-sm text-ocean-bg">
          <code>{`docker run -d -p 5230:5230 \\
  -v nemomemo-data:/app/data \\
  ghcr.io/davidallmon/nemomemo:latest`}</code>
        </pre>
        <p className="mt-3 text-sm text-ocean-muted">
          The first account you create becomes the reef keeper.{' '}
          <Link href="/docs/deploy" className="text-ocean-blue underline">
            Full deployment guide →
          </Link>
        </p>
      </section>

      {/* Personas */}
      <section className="border-t border-ocean-border bg-ocean-card py-16">
        <div className="mx-auto w-full max-w-5xl px-4">
          <h2 className="text-center font-display text-3xl font-bold">Small notes, many kinds of swimmers.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PERSONAS.map((persona) => (
              <div key={persona.title} className="rounded-2xl border border-ocean-border bg-ocean-bg p-5">
                <p className="text-2xl">{persona.emoji}</p>
                <p className="mt-2 font-display font-bold">{persona.title}</p>
                <p className="mt-1 text-sm text-ocean-muted">{persona.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-3xl px-4 py-16">
        <h2 className="text-center font-display text-3xl font-bold">Before you dive in</h2>
        <div className="mt-8 flex flex-col gap-4">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-2xl border border-ocean-border bg-ocean-card p-5">
              <p className="font-display font-bold">{item.q}</p>
              <p className="mt-1.5 text-sm text-ocean-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-ocean-border bg-ocean-card py-16 text-center">
        <h2 className="font-display text-3xl font-bold">Start with one memo.</h2>
        <p className="mt-2 text-ocean-muted">It doesn&apos;t even have to be a keeper.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/docs"
            className="rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-white transition-opacity hover:opacity-90"
          >
            Install NemoMemo
          </Link>
          <a
            href={DEMO_URL}
            className="rounded-xl border border-ocean-border bg-ocean-bg px-5 py-2.5 font-bold transition-colors hover:border-ocean-primary"
          >
            {DEMO_LABEL}
          </a>
        </div>
      </section>
    </>
  );
}
