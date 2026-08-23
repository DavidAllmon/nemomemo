import { formatReleaseDate, loadReleases } from '@/lib/changelog';
import { pageMeta } from '@/lib/site';

export const metadata = {
  ...pageMeta({
    title: 'Changelog',
    description:
      "Every NemoMemo release in plain language — what's new in the self-hosted notes app, without the jargon.",
    path: '/changelog',
  }),
  alternates: {
    canonical: 'https://trynemomemo.com/changelog',
    types: { 'application/rss+xml': '/changelog.xml' },
  },
};

export default function ChangelogPage() {
  const releases = loadReleases();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl font-bold">What&apos;s new in the reef</h1>
      <p className="mt-3 text-lg text-ocean-muted">
        Every NemoMemo release, in plain water — no jargon, just what changed for you.
        Your reef&apos;s version is on its About page.
      </p>
      <div className="mt-10 flex flex-col gap-8">
        {releases.map((release) => (
          <section
            key={release.version}
            id={`v${release.version}`}
            className="scroll-mt-20 rounded-2xl border border-ocean-border bg-ocean-card p-6"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-2xl font-bold">
                <a href={`#v${release.version}`} className="hover:text-ocean-primary">
                  v{release.version}
                </a>
              </h2>
              <p className="text-sm text-ocean-muted">{formatReleaseDate(release.date)}</p>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {release.bullets.map((bullet, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed text-ocean-muted">
                  <span aria-hidden>🫧</span>
                  <span>
                    {bullet.lead ? <strong className="text-ocean-ink">{bullet.lead}</strong> : null}
                    {bullet.lead ? ' ' : ''}
                    {bullet.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
