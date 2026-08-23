import Link from 'next/link';
import { DEMO_LABEL, DEMO_URL, MEMOS_URL, REPO_URL } from '@/lib/demo-url';

const LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: 'changelog', href: '/changelog' },
  { label: 'docs', href: '/docs' },
  { label: 'blog', href: '/blog' },
  { label: 'demo', href: DEMO_URL, external: true },
  { label: 'github', href: REPO_URL, external: true },
  { label: 'memos (upstream)', href: MEMOS_URL, external: true },
  { label: 'privacy', href: '/privacy' },
  { label: 'terms', href: '/terms' },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-ocean-border bg-ocean-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-6 font-mono text-xs text-ocean-muted sm:flex-row sm:items-center sm:justify-between">
        <span>
          © 2026 nemomemo · ELv2 ·{' '}
          <span className="font-display text-[13px] font-bold text-ocean-ink">
            just keep swimming
          </span>{' '}
          🫧
        </span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LINKS.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-ocean-ink"
              >
                {link.label}
              </a>
            ) : (
              <Link key={link.label} href={link.href} className="transition-colors hover:text-ocean-ink">
                {link.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
