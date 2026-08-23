import { CompareLayout, type Comparison } from '@/components/compare-layout';
import { ReefCousinMark } from '@/components/sea-life';
import { MEMOS_URL } from '@/lib/demo-url';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'NemoMemo vs. Memos',
  description:
    'An honest comparison of NemoMemo and Memos, the open-source self-hosted memo app that inspired it — what Memos does better, and what NemoMemo adds.',
  path: '/compare/memos',
});

const comparison: Comparison = {
  name: 'Memos',
  creature: <ReefCousinMark className="h-16 w-20" />,
  species: 'The reef cousin',
  heading: 'NemoMemo vs. Memos',
  subheading: 'The unusual comparison page where we tell you the other product is excellent.',
  intro: [
    'Memos is the open-source, self-hosted memo app that inspired NemoMemo — a private, Markdown-native timeline you run yourself. We think it is excellent, and if you have never tried a self-hosted memo timeline, starting with either app will teach you whether the shape fits your brain.',
    'The two projects share a philosophy (quick capture, plain Markdown, your server) and differ in maturity and personality. Memos is the larger, older project with a bigger feature surface and a huge community. NemoMemo is an independent recreation that trades some of that surface for ephemerality and warmth.',
  ],
  chooseThem: {
    lead: 'Run Memos if you need…',
    items: [
      'SSO / identity-provider login',
      'S3-compatible attachment storage',
      'Webhooks, RSS feeds, and a web clipper',
      'Interfaces in 40+ languages',
      'The reassurance of a large, long-running community',
    ],
  },
  chooseUs: {
    lead: 'Run NemoMemo if you want…',
    items: [
      'Dory memos — notes that delete themselves after 24 hours, attachments and share links included',
      'Expiring share links (1, 7, 30 days, or never)',
      'A filter language shared by search, saved views, and the API',
      'A warmer, reef-flavored take on the same idea',
    ],
  },
  rows: [
    { label: 'License', them: 'MIT (open source)', us: 'ELv2 (source-available)' },
    { label: 'Storage', them: 'SQLite, MySQL, or PostgreSQL', us: 'SQLite' },
    { label: 'Ephemeral notes', them: 'Not built in', us: 'Dory memos (24h)' },
    { label: 'Deployment', them: 'One container', us: 'One container' },
    { label: 'Cost', them: 'Free', us: 'Free to self-host' },
  ],
  closing:
    'If the Memos feature list is what you need today, run Memos — seriously, and go star them on GitHub. If a smaller, cuter timeline with permission to forget sounds right, NemoMemo is a docker run away.',
};

export default function Page() {
  return (
    <>
      <CompareLayout comparison={comparison} />
      <p className="mx-auto -mt-6 w-full max-w-3xl px-4 pb-14 text-sm text-ocean-muted">
        Memos lives at{' '}
        <a href={MEMOS_URL} className="font-semibold text-ocean-blue hover:underline" rel="noreferrer">
          github.com/usememos/memos
        </a>
        .
      </p>
    </>
  );
}
