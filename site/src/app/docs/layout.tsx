import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    // reef-deep pins the ocean-* tokens to the marketing palette so the nav
    // title, links, and anything ocean-colored match the landing page exactly.
    <div className="reef-deep">
      <DocsLayout
        {...baseOptions()}
        tree={source.getPageTree()}
        themeSwitch={{ enabled: false }}
      >
        {children}
      </DocsLayout>
    </div>
  );
}
