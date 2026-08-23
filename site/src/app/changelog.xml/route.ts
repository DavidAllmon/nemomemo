import { loadReleases } from '@/lib/changelog';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function GET() {
  const items = loadReleases()
    .map((release) => {
      const summary = release.bullets
        .map((bullet) => (bullet.lead ? `${bullet.lead} ${bullet.text}` : bullet.text))
        .join(' · ');
      return `    <item>
      <title>NemoMemo v${release.version}</title>
      <link>${SITE_URL}/changelog#v${release.version}</link>
      <guid>${SITE_URL}/changelog#v${release.version}</guid>
      <pubDate>${new Date(`${release.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(summary)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>NemoMemo Changelog</title>
    <link>${SITE_URL}/changelog</link>
    <description>Every NemoMemo release, in plain water.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
