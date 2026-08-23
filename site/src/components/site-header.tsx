import Link from 'next/link';
import { GitHubIcon } from '@/components/github-icon';
import { NemoMark } from '@/components/nemo-mark';
import { REPO_URL } from '@/lib/demo-url';
import { APP_VERSION } from '@/lib/version';

const NAV: { label: string; href: string }[] = [
  { label: 'features', href: '/#features' },
  { label: 'compare', href: '/#compare' },
  { label: 'pricing', href: '/#pricing' },
  { label: 'blog', href: '/blog' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ocean-border bg-ocean-bg/95">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5 font-mono text-[13px]">
        <Link href="/" className="flex items-center gap-2.5">
          <NemoMark className="h-6 w-8" />
          <span className="font-bold tracking-wide text-ocean-ink">nemomemo</span>
          <span className="hidden text-ocean-muted sm:inline">v{APP_VERSION}</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-5 font-medium text-ocean-muted md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-ocean-ink">
              {item.label}
            </Link>
          ))}
          <span className="text-ocean-border" aria-hidden>
            |
          </span>
          <Link href="/docs" className="transition-colors hover:text-ocean-ink">
            [docs ↗]
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="hidden text-ocean-muted transition-colors hover:text-ocean-ink sm:block"
          >
            <GitHubIcon className="size-4" />
          </a>
          <Link
            href="/docs"
            className="bg-ocean-primary px-4 py-1.5 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
          >
            install
          </Link>
          {/* Mobile menu (CSS-only) */}
          <details className="group relative md:hidden">
            <summary
              className="cursor-pointer list-none font-semibold text-ocean-muted transition-colors hover:text-ocean-ink [&::-webkit-details-marker]:hidden"
              aria-label="Menu"
            >
              <span className="group-open:hidden">[menu]</span>
              <span className="hidden group-open:inline">[close]</span>
            </summary>
            <nav className="absolute right-0 top-9 z-50 flex w-44 flex-col border border-ocean-border bg-ocean-bg font-medium">
              {[...NAV, { label: 'docs ↗', href: '/docs' }].map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className="border-b border-ocean-border px-4 py-2.5 text-ocean-muted transition-colors last:border-b-0 hover:text-ocean-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
