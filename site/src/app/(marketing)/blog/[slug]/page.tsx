import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/json-ld';
import { OceanCanvas } from '@/components/terminal/ocean-canvas';
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
    <div className="relative">
      <OceanCanvas />
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

      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-24 pt-16">
        {/* Entry header */}
        <p className="break-all font-mono text-[12.5px] text-ocean-muted" data-reveal>
          ${' '}
          <Link href="/blog" className="text-ocean-blue hover:underline">
            cat ships.log
          </Link>
          /{post.data.date}-{params.slug}.md
        </p>
        <h1
          className="mt-5 font-mono text-3xl font-bold leading-tight tracking-tight sm:text-[40px]"
          data-reveal
        >
          {post.data.title}
        </h1>
        <p className="mt-4 font-mono text-xs text-ocean-muted" data-reveal>
          logged <time dateTime={post.data.date}>{formatPostDate(post.data.date)}</time>
          <span className="mx-2 opacity-60">·</span>
          {post.data.author}
        </p>

        {/* Reading pane — a document floating in the water */}
        <article
          className="mt-8 border border-ocean-border bg-ocean-bg/90 px-6 py-2 sm:px-10 sm:py-4"
          data-reveal
        >
          {/* `dark` keys the Fumadocs code-block theme to the fixed Terminal Reef palette. */}
          <div className="dark reef-prose">
            <MDX components={getMDXComponents()} />
          </div>
        </article>

        <p className="mt-8 font-mono text-[13px] text-ocean-muted" data-reveal>
          $ echo &quot;just keep swimming&quot; 🫧
        </p>

        {/* Older / newer */}
        <nav
          className="mt-8 flex flex-col gap-3 border-t border-ocean-border pt-6 font-mono text-[13px] sm:flex-row sm:justify-between"
          data-reveal
        >
          {older ? (
            <Link href={older.url} className="group max-w-xs">
              <span className="text-ocean-muted">← older </span>
              <span className="font-semibold group-hover:text-ocean-primary">
                {older.data.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {newer ? (
            <Link href={newer.url} className="group max-w-xs sm:text-right">
              <span className="font-semibold group-hover:text-ocean-primary">
                {newer.data.title}
              </span>
              <span className="text-ocean-muted"> newer →</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>

        <div className="mt-12 flex flex-wrap items-center gap-4 font-mono text-sm font-semibold" data-reveal>
          <Link
            href="/docs"
            className="bg-ocean-primary px-5 py-2.5 text-ocean-on-primary transition-opacity hover:opacity-90"
          >
            install nemomemo
          </Link>
          <span className="text-[12.5px] font-normal text-ocean-muted">
            like reading about a notes app? you might like using one more.
          </span>
        </div>
      </div>
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
