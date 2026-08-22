import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_URL } from '@/lib/demo-url';

export const metadata: Metadata = { title: 'Terms of Service' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ocean-muted">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-ocean-muted">
        Last updated: August 22, 2026 · These terms cover <strong>NemoMemo Cloud</strong>, the hosted
        subscription service. The self-hosted software is separate: it&apos;s free to self-host under the Elastic License 2.0 and
        governed only by its license.
      </p>

      <Section title="The service">
        <p>
          NemoMemo Cloud gives you a private, hosted NemoMemo instance (&ldquo;your reef&rdquo;) at a
          subdomain you choose, operated by Tech it Dave (doing business as NemoMemo,
          &ldquo;we&rdquo;). You get the full feature set of the self-hostable software; we handle the
          servers, updates, and nightly backups.
        </p>
      </Section>

      <Section title="Accounts & your reef">
        <p>
          Payment happens first; you then claim your reef by picking its subdomain and creating its
          first (admin) account. You are responsible for that account, for the people you invite, and
          for the content stored in your reef. Reef subdomains are first-come, first-served; we may
          reclaim addresses that squat on trademarks or impersonate others.
        </p>
      </Section>

      <Section title="Billing">
        <p>
          Subscriptions are $1.99/month or $19/year, charged by Stripe. We never see or store your
          card. You can update your card or cancel anytime from the billing portal in your
          reef&apos;s Settings — cancellation stops future charges and your reef stays up through the
          period you&apos;ve paid for.
        </p>
        <p>
          <strong>Refunds:</strong> within 14 days of a charge, we&apos;ll refund it in full, no
          questions asked. Ask via the support link below.
        </p>
      </Section>

      <Section title="If a payment fails or a subscription ends">
        <p>
          A failed payment marks your reef past-due while Stripe retries. If the subscription ends
          (canceled or payments keep failing), your reef is suspended: sign-in is blocked but the data
          is kept for <strong>90 days</strong>, during which resubscribing or contacting support
          restores it. After 90 days the reef and its data are permanently deleted.
        </p>
      </Section>

      <Section title="Fair use">
        <p>
          Memos are unlimited. To keep the reef healthy for everyone, each reef currently includes up
          to 25 members and 5 GB of attachment storage. These are abuse brakes, not upsells — if you
          bump into them in good faith, ask and we&apos;ll raise them.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Don&apos;t use your reef to host content that is illegal, infringes others&apos; rights, or
          harms people or the service (malware, spam operations, harassment). We may suspend reefs
          that do, and will tell you why.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          Your memos are yours. Each reef lives in its own isolated database, backed up nightly. You
          can export your data at any time (and the source being freely self-hostable means you can always
          take your export to a self-hosted instance).
        </p>
      </Section>

      <Section title="The honest part">
        <p>
          NemoMemo Cloud is a small, lovingly-run service, provided &ldquo;as is&rdquo; without
          warranties, with community support via{' '}
          <a href={SUPPORT_URL} className="text-ocean-primary hover:underline">
            GitHub Discussions
          </a>
          . We aim for high uptime and honest communication, but our liability is limited to the
          amount you&apos;ve paid us in the last 12 months. We may update these terms; material
          changes will be announced on this page with a new date.
        </p>
      </Section>

      <p className="mt-10 text-sm text-ocean-muted">
        Questions? Surface at{' '}
        <a href={SUPPORT_URL} className="text-ocean-primary hover:underline">
          GitHub Discussions
        </a>{' '}
        · See also our <Link href="/privacy" className="text-ocean-primary hover:underline">Privacy Policy</Link>. 🫧
      </p>
    </div>
  );
}
