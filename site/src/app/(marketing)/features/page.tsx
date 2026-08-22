import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Features' };

const BUCKETS: { title: string; blurb: string; items: { name: string; body: string }[] }[] = [
  {
    title: 'Capture',
    blurb: 'Get the thought down before it swims off.',
    items: [
      { name: 'Markdown editor', body: 'CodeMirror-powered box with a formatting toolbar, drafts that survive reloads, and ⌘+Enter to save.' },
      { name: 'Inline tags', body: 'Type #reef or nested #dev/docker anywhere — tags are extracted automatically, no management screen.' },
      { name: 'Attachments', body: 'Paste screenshots or drop files straight into the editor.' },
      { name: 'Task lists', body: 'Checkboxes you can tick right in the rendered memo — the source updates itself.' },
      { name: 'Dory memos', body: 'Opt a memo into 24-hour forgetting with one click of the little blue tang.' },
    ],
  },
  {
    title: 'Review',
    blurb: 'Find it again — or watch it go.',
    items: [
      { name: 'Filter expressions', body: 'One language everywhere: tag in ["work"] && has_incomplete_tasks. Search chips, saved views, and the API all speak it.' },
      { name: 'Saved views', body: 'Name a filter and pin it to your sidebar, with a Validate button and example gallery.' },
      { name: 'Calendar heatmap', body: 'Your writing streak at a glance; click a day to filter to it.' },
      { name: '⌘K search', body: 'Type words, get memos. Each word becomes a chip.' },
      { name: 'Pin & archive', body: 'Pins float to the top. The archive is the treasure chest even Dory cannot touch.' },
    ],
  },
  {
    title: 'Publishing',
    blurb: 'Share exactly as much as you mean to.',
    items: [
      { name: 'Three visibilities', body: 'Private, protected (any signed-in member), or public — per memo.' },
      { name: 'Share links', body: 'Tokenized links that work without an account, expiring in 1, 7, 30 days, or never.' },
      { name: 'Explore feed', body: 'The shared timeline of your whole reef.' },
      { name: 'Profiles', body: 'Every member gets a public page with their shared memos and stats.' },
    ],
  },
  {
    title: 'Together',
    blurb: 'A reef is better with other fish.',
    items: [
      { name: 'Comments', body: 'Full Markdown comments on any memo you can see.' },
      { name: 'Reactions', body: 'An admin-curated emoji set (🐠 and 🫧 included).' },
      { name: 'Mentions', body: '@username notifies people in their inbox.' },
      { name: 'Members', body: 'Admins invite, archive, and restore accounts.' },
    ],
  },
  {
    title: 'Ownership',
    blurb: 'It runs on your hardware and answers to you.',
    items: [
      { name: 'Single container', body: 'One docker run, one data volume: SQLite + uploads.' },
      { name: 'Zero telemetry', body: 'Nothing phones home. Ever.' },
      { name: 'Source-available', body: 'Read it, fork it, self-host it free forever (ELv2).' },
      { name: 'REST API', body: 'Everything the app does is a JSON endpoint you can script.' },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <h1 className="text-center font-display text-4xl font-bold">Everything in the reef</h1>
      <p className="mt-3 text-center text-lg text-ocean-muted">
        Deliberately small. Each feature earns its place.
      </p>
      <div className="mt-10 flex flex-col gap-10">
        {BUCKETS.map((bucket) => (
          <section key={bucket.title}>
            <h2 className="font-display text-2xl font-bold">{bucket.title}</h2>
            <p className="text-ocean-muted">{bucket.blurb}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bucket.items.map((item) => (
                <div key={item.name} className="rounded-2xl border border-ocean-border bg-ocean-card p-4">
                  <p className="font-display font-bold">{item.name}</p>
                  <p className="mt-1 text-sm text-ocean-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
