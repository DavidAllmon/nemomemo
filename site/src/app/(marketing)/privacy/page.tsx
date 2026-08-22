import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_URL } from '@/lib/demo-url';

export const metadata: Metadata = { title: 'Privacy Policy' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ocean-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ocean-muted">
        Last updated: August 22, 2026 · This covers <strong>NemoMemo Cloud</strong> and this website.
        If you self-host NemoMemo, none of this applies — your data never touches us.
      </p>

      <Section title="What we collect">
        <p>
          <strong>Your reef&apos;s content</strong> — memos, attachments, member accounts, settings —
          stored so we can host it for you. That&apos;s the product, and it&apos;s the only reason we
          have it.
        </p>
        <p>
          <strong>Billing details</strong> are handled entirely by Stripe: your card number never
          reaches our servers. We keep only Stripe&apos;s identifiers for your subscription so we know
          which reef is paid for.
        </p>
        <p>
          <strong>Server logs</strong> (IP addresses, request paths, timestamps) for keeping the
          service healthy and abuse at bay, kept briefly and not mined for anything.
        </p>
      </Section>

      <Section title="What we don't do">
        <p>
          We don&apos;t read your memos except when strictly required to operate the service (a
          support request from you, an abuse report, a legal obligation). We don&apos;t sell or share
          your data, run ads, use third-party analytics trackers, or train AI models on your reef.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          One session cookie, on your reef&apos;s own subdomain, to keep you signed in. No tracking
          cookies. This marketing site sets none at all.
        </p>
      </Section>

      <Section title="Where your data lives">
        <p>
          Each reef is an isolated database — reefs cannot see each other. Nightly encrypted backups
          are kept off the primary server. When a subscription ends, data is retained for 90 days
          (so you can come back or export), then permanently deleted, backups included on their
          rotation schedule.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Export your data anytime. Delete your reef anytime (cancel, then ask — or just let the 90
          days run). Ask us what we hold about you and we&apos;ll tell you plainly. Reach us via{' '}
          <a href={SUPPORT_URL} className="text-ocean-primary hover:underline">
            GitHub Discussions
          </a>
          .
        </p>
      </Section>

      <p className="mt-10 text-sm text-ocean-muted">
        See also our <Link href="/terms" className="text-ocean-primary hover:underline">Terms of Service</Link>. 🫧
      </p>
    </div>
  );
}
