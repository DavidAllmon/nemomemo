import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Use cases' };

const GROUPS = [
  {
    title: 'For yourself',
    subtitle: 'Think, learn, and make.',
    cases: [
      { title: 'Daily log', body: 'One memo per thought, a heatmap of your streak, and a calendar to swim back through.' },
      { title: 'Dev notebook', body: 'TILs, snippets with syntax highlighting, and #project tags that organize themselves.' },
      { title: 'Reading notes', body: 'Quotes and links with a #reading tag; filter to has_link when you need a source.' },
    ],
  },
  {
    title: 'With people',
    subtitle: 'Keep a small shared record.',
    cases: [
      { title: 'Household reef', body: 'Protected memos for the family: chores, plans, and the wifi password.' },
      { title: 'Tiny team log', body: 'Standup notes and decisions in a timeline everyone can search — with comments and reactions.' },
      { title: 'Classroom', body: 'A teacher posts public memos; students explore, react, and keep their own private notes.' },
    ],
  },
  {
    title: 'For a day',
    subtitle: 'The Dory specialty.',
    cases: [
      { title: 'Parking spots', body: 'Level 2, row F. Gone tomorrow, exactly as it should be.' },
      { title: 'One-day reminders', body: 'Pick up the package, defrost the chicken, call before 5.' },
      { title: 'Venting', body: 'Write it out, feel better, and let Dory take it from there. 🫧' },
    ],
  },
];

export default function UseCasesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <h1 className="text-center font-display text-4xl font-bold">Small notes, many kinds of work</h1>
      <div className="mt-10 flex flex-col gap-10">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="font-display text-2xl font-bold">{group.title}</h2>
            <p className="text-ocean-muted">{group.subtitle}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {group.cases.map((useCase) => (
                <div key={useCase.title} className="rounded-2xl border border-ocean-border bg-ocean-card p-4">
                  <p className="font-display font-bold">{useCase.title}</p>
                  <p className="mt-1 text-sm text-ocean-muted">{useCase.body}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-12 text-center text-lg font-semibold">
        Whatever the job — start with one note. 🐠
      </p>
    </div>
  );
}
