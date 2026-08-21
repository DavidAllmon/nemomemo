import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Blog' };

export const POSTS = [
  {
    slug: 'introducing-dory-memos',
    title: 'Introducing Dory memos: notes that forget themselves',
    date: 'August 21, 2026',
    excerpt:
      'Every notes app helps you remember. We built the first feature that helps you forget — on purpose, on a timer, with a fish.',
  },
  {
    slug: 'why-a-cute-notes-app',
    title: 'Why we made a notes app cute',
    date: 'August 21, 2026',
    excerpt:
      'Self-hosted software doesn’t have to look like a server rack. On warmth, clownfish orange, and taking delight seriously.',
  },
];

export default function BlogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-center font-display text-4xl font-bold">From the reef</h1>
      <div className="mt-10 flex flex-col gap-4">
        {POSTS.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="rounded-2xl border border-ocean-border bg-ocean-card p-5 transition-colors hover:border-ocean-primary"
          >
            <p className="text-xs font-bold text-ocean-muted">{post.date}</p>
            <p className="mt-1 font-display text-xl font-bold">{post.title}</p>
            <p className="mt-1.5 text-sm text-ocean-muted">{post.excerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
