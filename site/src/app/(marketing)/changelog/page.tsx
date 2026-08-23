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
    <div>
      <section className="bg-gradient-to-b from-ocean-abyss to-ocean-bg px-4 pb-4 pt-16 text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-ocean-blue">
          The dive log
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
          What&apos;s new in the reef
        </h1>
        <p className="mx-auto mt-3 max-w-md text-lg text-ocean-muted">
          Every release, in plain water — no jargon, just what changed for you. Your reef&apos;s
          version is on its About page.{' '}
          <a href="/changelog.xml" className="font-semibold text-ocean-blue hover:underline">
            RSS
          </a>
        </p>
      </section>
      <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-10">
        <div className="relative flex flex-col gap-10 border-l-2 border-ocean-border pl-8 sm:ml-4">
          {releases.map((release) => (
            <section key={release.version} id={`v${release.version}`} className="relative scroll-mt-20">
              <span
                className="absolute -left-[41px] top-1 flex size-5 items-center justify-center rounded-full border-2 border-ocean-primary bg-ocean-bg sm:-left-[42px]"
                aria-hidden
              >
                <span className="size-1.5 rounded-full bg-ocean-primary" />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-2xl font-bold">
                  <a href={`#v${release.version}`} className="hover:text-ocean-primary">
                    v{release.version}
                  </a>
                </h2>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-ocean-muted">
                  {formatReleaseDate(release.date)}
                </p>
              </div>
              <ul className="mt-3 flex flex-col gap-2.5">
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
    </div>
  );
}
