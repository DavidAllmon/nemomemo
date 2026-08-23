import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/json-ld';
import { blog, formatPostDate } from '@/lib/blog';
import { OG_IMAGE, SITE_URL, absoluteUrl } from '@/lib/site';
import { getMDXComponents } from '@/mdx-components';

export default async function Post(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = blog.getPage([params.slug]);
  if (!post) notFound();

  const MDX = post.data.body;

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-14">
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
      <p className="text-xs font-bold text-ocean-muted">
        <Link href="/blog" className="hover:text-ocean-ink">
          Blog
        </Link>{' '}
        · <time dateTime={post.data.date}>{formatPostDate(post.data.date)}</time> · {post.data.author}
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold">{post.data.title}</h1>
      {/* `dark` keys the Fumadocs code-block theme to match the fixed Deep Sea palette. */}
      <div className="dark reef-prose mt-6">
        <MDX components={getMDXComponents()} />
      </div>
    </article>
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
