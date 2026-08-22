import Link from 'next/link';
import { NemoMark } from '@/components/nemo-mark';
import { DEMO_LABEL, DEMO_URL, MEMOS_URL, REPO_URL } from '@/lib/demo-url';

const GROUPS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Explore',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Features', href: '/features' },
      { label: 'Use cases', href: '/use-cases' },
      { label: 'Compare', href: '/compare' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Tools',
    links: [{ label: DEMO_LABEL, href: DEMO_URL, external: true }],
  },
  {
    title: 'Features',
    links: [
      { label: 'Dory memos', href: '/docs/dory' },
      { label: 'Markdown notes', href: '/docs/memos' },
      { label: 'Tags & views', href: '/docs/tags' },
      { label: 'Sharing', href: '/docs/sharing' },
      { label: 'Self-hosting', href: '/docs/deploy' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'API reference', href: '/docs/api' },
      { label: 'GitHub', href: REPO_URL, external: true },
      { label: 'Inspired by Memos', href: MEMOS_URL, external: true },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-ocean-border bg-ocean-card">
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-5">
        <div>
          <div className="flex items-center gap-1.5">
            <NemoMark className="size-7" />
            <span className="font-display text-lg font-bold text-ocean-ink">
              Nemo<span className="text-ocean-primary">Memo</span>
            </span>
          </div>
          <p className="mt-2 text-sm text-ocean-muted">
            A quiet reef for the thoughts worth keeping — and a friendly fish for the ones that
            aren&apos;t.
          </p>
        </div>
        {GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ocean-muted">
              {group.title}
            </p>
            <ul className="flex flex-col gap-1.5">
              {group.links.map((link) =>
                link.external ? (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-ocean-muted hover:text-ocean-ink"
                    >
                      {link.label}
                    </a>
                  </li>
                ) : (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-ocean-muted hover:text-ocean-ink">
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ocean-border py-4 text-center text-xs text-ocean-muted">
        MIT licensed · Self-hosted · Just keep swimming 🫧
      </div>
    </footer>
  );
}
