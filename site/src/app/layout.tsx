import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import { JsonLd } from '@/components/json-ld';
import { REPO_URL } from '@/lib/demo-url';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import './global.css';

const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' });
const baloo = Baloo_2({ subsets: ['latin'], variable: '--font-baloo' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NemoMemo — Self-hosted notes that forget on purpose',
    template: '%s · NemoMemo',
  },
  description:
    'NemoMemo is a free, self-hosted note-taking app: a private Markdown memo timeline with tags, sharing, and Dory memos that delete themselves after 24 hours. One Docker container, one SQLite file.',
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf5ea' },
    { media: '(prefers-color-scheme: dark)', color: '#151e2e' },
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${baloo.variable}`}
      style={{ fontFamily: 'var(--font-nunito), ui-rounded, sans-serif' }}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: SITE_NAME,
            url: SITE_URL,
            logo: `${SITE_URL}/icon.svg`,
            sameAs: [REPO_URL],
          }}
        />
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: SITE_URL,
          }}
        />
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
