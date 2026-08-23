import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { NemoMark } from '@/components/nemo-mark';
import { DEMO_LABEL, DEMO_URL } from '@/lib/demo-url';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-1.5 font-display text-base font-bold">
          <NemoMark className="size-6" />
          Nemo<span className="text-ocean-primary">Memo</span>
        </span>
      ),
    },
    links: [
      { text: 'Features', url: '/features' },
      { text: 'Compare', url: '/compare' },
      { text: 'Pricing', url: '/pricing' },
      { text: 'Blog', url: '/blog' },
      { text: 'Changelog', url: '/changelog' },
      { text: DEMO_LABEL, url: DEMO_URL, external: true },
    ],
  };
}
