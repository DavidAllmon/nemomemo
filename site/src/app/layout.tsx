import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import './global.css';

const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' });
const baloo = Baloo_2({ subsets: ['latin'], variable: '--font-baloo' });

export const metadata: Metadata = {
  title: {
    default: 'NemoMemo — Write it down. Or let Dory forget it.',
    template: '%s · NemoMemo',
  },
  description:
    'A cute, self-hosted memo timeline. Markdown-native quick notes with tags, sharing, and Dory memos that forget themselves in 24 hours.',
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
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
