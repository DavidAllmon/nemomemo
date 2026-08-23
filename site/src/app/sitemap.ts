import type { MetadataRoute } from 'next';
import { getSortedPosts } from '@/lib/blog';
import { SITE_URL, absoluteUrl } from '@/lib/site';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

const MARKETING_PATHS = [
  '/',
  '/compare',
  '/compare/memos',
  '/compare/notion',
  '/compare/google-keep',
  '/compare/obsidian',
  '/pricing',
  '/blog',
  '/changelog',
  '/privacy',
  '/terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...MARKETING_PATHS.map((path) => ({
      url: path === '/' ? SITE_URL : absoluteUrl(path),
      priority: path === '/' ? 1 : 0.7,
    })),
    ...getSortedPosts().map((post) => ({
      url: absoluteUrl(post.url),
      lastModified: post.data.date,
      priority: 0.6,
    })),
    ...source.getPages().map((page) => ({
      url: absoluteUrl(page.url),
      priority: 0.6,
    })),
  ];
}
