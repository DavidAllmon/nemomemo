import Link from 'next/link';
import { DoryMark } from '@/components/dory-mark';
import { NemoMark } from '@/components/nemo-mark';
import { Bubbles, TinyFish, WaveEdge } from '@/components/sea-life';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'Use cases',
  description:
    'What people do with a self-hosted memo timeline: daily logs, dev notebooks and TILs, shared household notes, tiny team logs, and one-day Dory memos for parking spots and reminders.',
  path: '/use-cases',
});

const GROUPS = [
  {
    title: 'For yourself',
    subtitle: 'Think, learn, and make.',
    accent: 'oklch(0.72 0.13 48)',
    cases: [
      { title: 'Daily log', body: 'One memo per thought, a heatmap of your streak, and a calendar to swim back through.' },
      { title: 'Dev notebook', body: 'TILs, snippets with syntax highlighting, and #project tags that organize themselves.' },
      { title: 'Reading notes', body: 'Quotes and links with a #reading tag; filter to has_link when you need a source.' },
    ],
  },
  {
    title: 'With people',
    subtitle: 'Keep a small shared record.',
    accent: 'oklch(0.68 0.1 230)',
    cases: [
      { title: 'Household reef', body: 'Protected memos for the family: chores, plans, and the wifi password.' },
      { title: 'Tiny team log', body: 'Standup notes and decisions in a timeline everyone can search — with comments and reactions.' },
      { title: 'Classroom', body: 'A teacher posts public memos; students explore, react, and keep their own private notes.' },
    ],
  },
  {
    title: 'For a day',
    subtitle: 'The Dory specialty.',
    accent: 'oklch(0.72 0.12 255)',
    cases: [
      { title: 'Parking spots', body: 'Level 2, row F. Gone tomorrow, exactly as it should be.' },
      { title: 'One-day reminders', body: 'Pick up the package, defrost the chicken, call before 5.' },
      { title: 'Venting', body: 'Write it out, feel better, and let Dory take it from there. 🫧' },
    ],
  },
];

export default function UseCasesPage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-b from-ocean-abyss to-ocean-bg px-4 pb-6 pt-16 text-center">
        <div className="animate-drift pointer-events-none absolute right-[14%] top-10 flex gap-2.5 text-ocean-blue opacity-40" aria-hidden>
          <TinyFish className="h-3 w-6" />
          <TinyFish className="h-2.5 w-5 -translate-y-2" />
          <TinyFish className="h-2.5 w-5 translate-y-1" />
        </div>
        <Bubbles className="pointer-events-none absolute left-[12%] top-12 h-16 w-9 text-ocean-blue opacity-40" />
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
          Small notes, many kinds of swimmers
        </h1>
        <p className="mx-auto mt-3 max-w-md text-lg text-ocean-muted">
          The timeline is the same. What swims through it is up to you.
        </p>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-8">
        {GROUPS.map((group, groupIndex) => (
          <section
            key={group.title}
            className={`relative flex flex-col gap-8 py-12 sm:flex-row ${
              groupIndex < GROUPS.length - 1 ? 'border-b border-ocean-border' : ''
            }`}
          >
            <div className="w-full shrink-0 sm:w-52">
              <p
                className="font-mono text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: group.accent }}
              >
                Current {String(groupIndex + 1).padStart(2, '0')}
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">{group.title}</h2>
              <p className="mt-1 text-sm text-ocean-muted">{group.subtitle}</p>
              {groupIndex === 2 ? <DoryMark className="animate-float mt-5 h-12 w-[4.25rem]" /> : null}
            </div>
            <div className="flex flex-1 flex-col gap-6">
              {group.cases.map((useCase, caseIndex) => (
                <div
                  key={useCase.title}
                  className={`flex gap-4 ${caseIndex % 2 === 1 ? 'sm:ml-10' : ''}`}
                >
                  <span
                    className="mt-2 size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: group.accent }}
                    aria-hidden
                  />
                  <div>
                    <p className="font-display text-lg font-bold">{useCase.title}</p>
                    <p className="mt-0.5 text-[15px] leading-relaxed text-ocean-muted">
                      {useCase.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <WaveEdge fill="oklch(0.17 0.04 255)" />
      <section className="bg-[oklch(0.17_0.04_255)] px-4 pb-16 pt-8 text-center">
        <NemoMark bob className="mx-auto size-12" />
        <p className="mt-3 font-display text-xl font-bold">Whatever the job — start with one note.</p>
        <Link
          href="/docs"
          className="mt-5 inline-block rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
        >
          Install NemoMemo
        </Link>
      </section>
    </div>
  );
}
