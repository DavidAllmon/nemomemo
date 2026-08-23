import { CompareLayout, type Comparison } from '@/components/compare-layout';
import { NautilusMark } from '@/components/sea-life';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'NemoMemo vs. Obsidian',
  description:
    'Obsidian is a knowledge base; NemoMemo is the timeline for the notes that come before structure. How they differ — and why many people happily run both.',
  path: '/compare/obsidian',
});

const comparison: Comparison = {
  name: 'Obsidian',
  creature: <NautilusMark className="h-18 w-20" />,
  species: 'The nautilus',
  heading: 'NemoMemo vs. Obsidian',
  subheading: 'A knowledge base vs. the notes that come before structure.',
  intro: [
    'Obsidian is a serious tool for building a knowledge base: local Markdown files, backlinks, a graph, and a plugin ecosystem that can turn it into nearly anything. If you are cultivating a garden of connected, permanent notes, Obsidian is one of the best homes for it.',
    'NemoMemo lives upstream of that. It is the web-based timeline for the raw stream — the TIL, the link, the half-thought — available from any browser because it runs on your server, shareable with the people on your reef, and self-cleaning where you want it to be. Both speak Markdown, so the notes that grow up can move.',
  ],
  chooseThem: {
    lead: 'Use Obsidian for…',
    items: [
      'A permanent, linked knowledge base',
      'Local-first files on your own device',
      'Backlinks, graph view, and community plugins',
      'Long-form thinking and research',
    ],
  },
  chooseUs: {
    lead: 'Use NemoMemo for…',
    items: [
      'Quick capture from any browser, on any device',
      'A dated timeline rather than a folder of files',
      'Sharing single memos — with people or via expiring links',
      'The one-day notes Obsidian would keep forever',
    ],
  },
  rows: [
    { label: 'Shape', them: 'Vault of linked Markdown files', us: 'Chronological memo timeline' },
    { label: 'Where notes live', them: 'Local files (sync optional)', us: 'Your server, one SQLite file' },
    { label: 'Access', them: 'Desktop & mobile apps', us: 'Any web browser' },
    { label: 'Sharing', them: 'Via publish/sync add-ons', us: 'Per-memo visibility + share links' },
    { label: 'Ephemeral notes', them: 'Manual cleanup', us: 'Dory memos (24h)' },
    { label: 'Price', them: 'Free core, paid sync/publish', us: 'Free to self-host' },
  ],
  closing:
    'This is the least either/or comparison on the list: many people happily run both, capturing in NemoMemo and promoting the keepers into their vault. Markdown makes the handoff painless.',
};

export default function Page() {
  return <CompareLayout comparison={comparison} />;
}
