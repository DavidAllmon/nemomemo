import Link from 'next/link';
import { NemoMark } from '@/components/nemo-mark';
import { CLOUD_LIVE, DEMO_LABEL, DEMO_URL } from '@/lib/demo-url';

const NAV = [
  { label: 'Features', href: '/features' },
  { label: 'Use cases', href: '/use-cases' },
  { label: 'Compare', href: '/compare' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ocean-border bg-ocean-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-5 px-4">
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
          {CLOUD_LIVE ? (
            <Link
              href="/pricing#cloud"
              className="hidden rounded-xl border border-ocean-primary px-3.5 py-1.5 text-sm font-bold text-ocean-primary transition-colors hover:bg-ocean-primary hover:text-white sm:inline-block"
            >
              Get Cloud
            </Link>
          ) : null}
          <a
            href={DEMO_URL}
            className="rounded-xl bg-ocean-primary px-3.5 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >{DEMO_LABEL}</a>
        </div>
      </div>
    </header>
  );
}
