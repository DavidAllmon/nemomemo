import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Reveals } from '@/components/terminal/reveals';
import { SmoothScroll } from '@/components/terminal/smooth-scroll';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="reef-deep flex min-h-screen flex-col bg-ocean-bg text-ocean-ink">
      <SmoothScroll />
      <Reveals />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
