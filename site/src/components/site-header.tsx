import Link from 'next/link';
import { GitHubIcon } from '@/components/github-icon';
import { NemoMark } from '@/components/nemo-mark';
import { REPO_URL } from '@/lib/demo-url';

const NAV: { label: string; href: string }[] = [
  { label: 'Features', href: '/features' },
  { label: 'Compare', href: '/compare' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ocean-border bg-ocean-bg/95">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-5 px-4">
        <Link href="/" className="flex items-center gap-1.5">
          <NemoMark className="size-7" />
          <span className="font-display text-lg font-bold text-ocean-ink">
            Nemo<span className="text-ocean-primary">Memo</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-4 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-semibold text-ocean-muted transition-colors hover:text-ocean-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-full border border-ocean-border px-3 py-1.5 text-xs font-bold text-ocean-muted transition-colors hover:text-ocean-ink sm:inline-flex"
          >
            <GitHubIcon className="size-3.5" />
            GitHub
          </a>
          <Link
            href="/docs"
            className="rounded-xl bg-ocean-primary px-3.5 py-1.5 text-sm font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
          >
            Install
          </Link>
        </div>
      </div>
    </header>
  );
}
