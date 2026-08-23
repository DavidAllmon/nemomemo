import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/json-ld';
import { NemoMark } from '@/components/nemo-mark';
import { WaveEdge } from '@/components/sea-life';
import { blog, formatPostDate, getSortedPosts } from '@/lib/blog';
import { OG_IMAGE, SITE_URL, absoluteUrl } from '@/lib/site';
import { getMDXComponents } from '@/mdx-components';

export default async function Post(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = blog.getPage([params.slug]);
  if (!post) notFound();

  const MDX = post.data.body;
  const posts = getSortedPosts();
  const index = posts.findIndex((p) => p.url === post.url);
  const older = index >= 0 ? posts[index + 1] : undefined;
  const newer = index > 0 ? posts[index - 1] : undefined;

  return (
    <div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.data.title,
          description: post.data.description,
          datePublished: post.data.date,
          author: { '@type': 'Person', name: post.data.author },
          publisher: { '@type': 'Organization', name: 'NemoMemo', url: SITE_URL },
          mainEntityOfPage: absoluteUrl(post.url),
        }}
      />

      {/* Entry header */}
      <header className="bg-gradient-to-b from-ocean-abyss to-ocean-bg px-4 pt-14 text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-ocean-blue">
          <Link href="/blog" className="hover:underline">
            The ship&apos;s log
          </Link>
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl font-display text-4xl font-extrabold leading-tight sm:text-5xl">
          {post.data.title}
        </h1>
        <p className="mt-5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-ocean-muted">
          Logged <time dateTime={post.data.date}>{formatPostDate(post.data.date)}</time>
          <span className="mx-2 opacity-50">·</span>
          {post.data.author}
        </p>
        <div className="h-10" />
      </header>

      {/* Entry body */}
      <article className="mx-auto w-full max-w-2xl px-4">
        {/* `dark` keys the Fumadocs code-block theme to match the fixed Deep Sea palette. */}
        <div className="dark reef-prose">
          <MDX components={getMDXComponents()} />
        </div>

        {/* End of entry */}
        <div className="mt-14 flex flex-col items-center text-center">
          <NemoMark bob className="size-12" />
          <p className="mt-3 font-display font-bold text-ocean-muted">Just keep swimming.</p>
        </div>

        <nav className="mt-12 flex flex-col gap-3 border-t border-ocean-border pt-8 pb-16 sm:flex-row sm:justify-between">
          {older ? (
            <Link href={older.url} className="group max-w-xs">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-ocean-muted">
                ← Older entry
              </p>
              <p className="mt-1 font-display font-bold leading-snug group-hover:text-ocean-primary">
                {older.data.title}
              </p>
            </Link>
          ) : (
            <span />
          )}
          {newer ? (
            <Link href={newer.url} className="group max-w-xs sm:text-right">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-ocean-muted">
                Newer entry →
              </p>
              <p className="mt-1 font-display font-bold leading-snug group-hover:text-ocean-primary">
                {newer.data.title}
              </p>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </article>

      <WaveEdge fill="oklch(0.17 0.04 255)" />
      <section className="bg-[oklch(0.17_0.04_255)] px-4 pb-14 pt-6 text-center">
        <p className="text-sm text-ocean-muted">
          Like reading about a notes app? You might like using one more.
        </p>
        <Link
          href="/docs"
          className="mt-4 inline-block rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
        >
          Install NemoMemo
        </Link>
      </section>
    </div>
  );
}

export function generateStaticParams() {
  return blog.getPages().map((post) => ({ slug: post.slugs[0] }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const post = blog.getPage([params.slug]);
  if (!post) notFound();
  return {
    title: post.data.title,
    description: post.data.description,
    alternates: { canonical: absoluteUrl(post.url) },
    openGraph: {
      type: 'article',
      title: post.data.title,
      description: post.data.description,
      url: absoluteUrl(post.url),
      siteName: 'NemoMemo',
      publishedTime: post.data.date,
      authors: [post.data.author],
      images: [OG_IMAGE],
    },
  };
}
