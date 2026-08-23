import { CompareLayout, type Comparison } from '@/components/compare-layout';
import { GoldfishMark } from '@/components/sea-life';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'NemoMemo vs. Google Keep',
  description:
    'A self-hosted alternative to Google Keep: the same quick capture, but on your own server, in plain Markdown you can export and keep forever.',
  path: '/compare/google-keep',
});

const comparison: Comparison = {
  name: 'Google Keep',
  creature: <GoldfishMark className="h-16 w-20" />,
  species: 'The goldfish',
  heading: 'NemoMemo vs. Google Keep',
  subheading: 'The same speed, without handing your notes to Google.',
  intro: [
    "Google Keep nails the core job: open it, jot the thing, done. It is fast, free, and everywhere your Google account is. If that is all you want and you are comfortable with where the notes live, Keep is genuinely hard to beat.",
    'The trade is ownership. Your notes sit in Google\'s cloud, in Google\'s format, inside an ecosystem known for retiring products. NemoMemo keeps the capture speed — one box, type, go — but the notes land on your own server as plain Markdown, with real tags, a real filter language, and a fish who deletes the one-day stuff for you.',
  ],
  chooseThem: {
    lead: 'Stay with Keep if…',
    items: [
      'You want zero setup — no server, no Docker',
      'Deep Google integration (Assistant, Android widgets) matters',
      'Color-coded sticky notes are your mental model',
    ],
  },
  chooseUs: {
    lead: 'Switch to NemoMemo if…',
    items: [
      'You want your notes on hardware you control',
      'You want Markdown — code blocks, tables, real task lists',
      'You want notes you can grep, back up, and export forever',
      'You want the one-day notes to clean themselves up',
    ],
  },
  rows: [
    { label: 'Where notes live', them: "Google's cloud", us: 'Your server, one SQLite file' },
    { label: 'Format', them: 'Proprietary; exports via Takeout', us: 'Plain Markdown' },
    { label: 'Setup', them: 'None', us: 'One docker run' },
    { label: 'Tags & filters', them: 'Labels and search', us: 'Nested #tags + a filter language' },
    { label: 'Ephemeral notes', them: 'Manual cleanup', us: 'Dory memos (24h)' },
    { label: 'Price', them: 'Free', us: 'Free to self-host' },
  ],
  closing:
    'If self-hosting is on your radar at all, this is the easiest Keep habit to migrate: the capture flow is the same, and the ownership story is entirely different.',
};

export default function Page() {
  return <CompareLayout comparison={comparison} />;
}
