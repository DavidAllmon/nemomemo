import Link from 'next/link';
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
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-center font-display text-4xl font-bold">From the reef</h1>
      <p className="mt-3 text-center text-lg text-ocean-muted">
        Announcements, self-hosting guides, and the occasional fish-adjacent essay.
      </p>
      <div className="mt-10 flex flex-col gap-4">
        {posts.map((post) => (
          <Link
            key={post.url}
            href={post.url}
            className="rounded-2xl border border-ocean-border bg-ocean-card p-5 transition-colors hover:border-ocean-primary"
          >
            <p className="text-xs font-bold text-ocean-muted">
              <time dateTime={post.data.date}>{formatPostDate(post.data.date)}</time>
            </p>
            <p className="mt-1 font-display text-xl font-bold">{post.data.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ocean-muted">{post.data.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
