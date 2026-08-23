import Link from 'next/link';
import { Bubbles } from '@/components/sea-life';
import { formatPostDate, getSortedPosts } from '@/lib/blog';
import { pageMeta } from '@/lib/site';

export const metadata = {
  ...pageMeta({
    title: 'Blog',
    description:
      'Notes from the reef: product announcements, self-hosting guides, and design essays from the people who make NemoMemo.',
    path: '/blog',
  }),
  alternates: {
    canonical: 'https://trynemomemo.com/blog',
    types: { 'application/rss+xml': '/feed.xml' },
  },
};

export default function BlogPage() {
  const posts = getSortedPosts();
  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-b from-ocean-abyss to-ocean-bg px-4 pb-4 pt-16 text-center">
        <Bubbles className="pointer-events-none absolute left-[14%] top-8 h-16 w-9 text-ocean-blue opacity-40" />
        <Bubbles className="pointer-events-none absolute right-[12%] top-16 h-12 w-7 text-ocean-blue opacity-30" />
        <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-ocean-blue">
          The ship&apos;s log
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">From the reef</h1>
        <p className="mx-auto mt-3 max-w-md text-lg text-ocean-muted">
          Announcements, self-hosting guides, and the occasional fish-adjacent essay — logged like
          everything else around here: as a timeline.
        </p>
      </section>

      {/* Timeline */}
      <section className="mx-auto w-full max-w-2xl px-4 pb-20 pt-10">
        <div className="relative flex flex-col gap-10 border-l-2 border-ocean-border pl-8 sm:ml-4">
          {posts.map((post) => (
            <article key={post.url} className="relative">
              {/* timeline node */}
              <span
                className="absolute -left-[41px] top-1.5 flex size-5 items-center justify-center rounded-full border-2 border-ocean-blue bg-ocean-bg sm:-left-[42px]"
                aria-hidden
              >
                <span className="size-1.5 rounded-full bg-ocean-blue" />
              </span>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-ocean-muted">
                <time dateTime={post.data.date}>{formatPostDate(post.data.date)}</time>
                <span className="mx-2 opacity-50">·</span>
                {post.data.author}
              </p>
              <Link
                href={post.url}
                className="group mt-2 block rounded-2xl border border-ocean-border bg-ocean-card p-6 transition-colors hover:border-ocean-primary"
              >
                <h2 className="font-display text-2xl font-bold leading-snug group-hover:text-ocean-primary">
                  {post.data.title}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ocean-muted">
                  {post.data.description}
                </p>
                <p className="mt-4 text-sm font-bold text-ocean-blue">Read the entry →</p>
              </Link>
            </article>
          ))}
          {/* end of log */}
          <div className="relative">
            <span
              className="absolute -left-[38px] top-1 size-3.5 rounded-full border-2 border-ocean-border bg-ocean-bg sm:-left-[39px]"
              aria-hidden
            />
            <p className="text-sm text-ocean-muted">
              The log starts here — NemoMemo set sail in August 2026.{' '}
              <a href="/feed.xml" className="font-semibold text-ocean-blue hover:underline">
                Subscribe by RSS
              </a>{' '}
              for future entries.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
