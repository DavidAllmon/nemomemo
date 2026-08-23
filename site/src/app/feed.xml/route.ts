import { getSortedPosts } from '@/lib/blog';
import { SITE_URL, absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function GET() {
  const items = getSortedPosts()
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${absoluteUrl(post.url)}</link>
      <guid>${absoluteUrl(post.url)}</guid>
      <pubDate>${new Date(`${post.data.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(post.data.description ?? '')}</description>
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>NemoMemo Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Announcements, self-hosting guides, and fish-adjacent essays from the NemoMemo reef.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
