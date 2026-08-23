import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NemoMemo',
    short_name: 'NemoMemo',
    description:
      'A self-hosted, Markdown-native memo timeline with Dory memos that forget themselves in 24 hours.',
    start_url: '/',
    display: 'browser',
    background_color: '#151e2e',
    theme_color: '#151e2e',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
