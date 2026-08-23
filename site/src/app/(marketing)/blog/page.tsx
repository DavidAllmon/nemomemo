import Link from 'next/link';
import { OceanCanvas } from '@/components/terminal/ocean-canvas';
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
    <div className="relative">
      <OceanCanvas />
      <div className="relative z-10 mx-auto w-full max-w-4xl px-5 pb-24 pt-16">
        <p className="font-mono text-[13px]" data-reveal>
          <span className="font-bold text-ocean-primary">## SHIPS.LOG</span>{' '}
          <span className="text-ocean-muted">
            — announcements, self-hosting guides, and the occasional fish-adjacent essay ·{' '}
            <a href="/feed.xml" className="text-ocean-blue hover:underline">
              rss
            </a>
          </span>
        </p>
        <h1 className="mt-5 font-mono text-4xl font-bold tracking-tight sm:text-5xl" data-reveal>
          From the reef<span className="term-cursor" aria-hidden />
        </h1>
        <p className="mt-5 font-mono text-[13px] text-ocean-muted" data-reveal>
          $ ls -t entries/
        </p>

        <div className="mt-4 border border-ocean-border bg-ocean-bg/70" data-reveal="stagger">
          {posts.map((post) => (
            <Link
              key={post.url}
              href={post.url}
              className="group grid grid-cols-1 gap-x-6 border-b border-ocean-border px-5 py-5 transition-colors last:border-b-0 hover:bg-ocean-card/60 sm:grid-cols-[130px_1fr_auto] sm:items-baseline"
            >
              <p className="font-mono text-xs text-ocean-muted">
                <time dateTime={post.data.date}>{post.data.date}</time>
              </p>
              <div>
                <h2 className="mt-1 font-mono text-lg font-bold leading-snug group-hover:text-ocean-primary sm:mt-0">
                  {post.data.title}
                </h2>
                <p className="mt-1.5 max-w-xl font-mono text-[12.5px] leading-relaxed text-ocean-muted">
                  {post.data.description}
                </p>
              </div>
              <span
                className="mt-2 font-mono text-[13px] font-semibold text-ocean-blue opacity-0 transition-opacity group-hover:opacity-100 sm:mt-0"
                aria-hidden
              >
                read →
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-6 font-mono text-[12.5px] text-ocean-muted" data-reveal>
          $ head -1 ships.log{'  '}
          <span className="text-ocean-ink">
            # set sail august 2026 — <time dateTime={posts[posts.length - 1]?.data.date}>{formatPostDate(posts[posts.length - 1]?.data.date ?? '2026-08-21')}</time>
          </span>
        </p>
      </div>
    </div>
  );
}
