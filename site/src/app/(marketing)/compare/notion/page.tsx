import { CompareLayout, type Comparison } from '@/components/compare-layout';
import { OctopusMark } from '@/components/sea-life';
import { pageMeta } from '@/lib/site';

export const metadata = pageMeta({
  title: 'NemoMemo vs. Notion',
  description:
    'A self-hosted alternative to Notion for quick notes: why a Markdown memo timeline beats a workspace for the thoughts that die waiting on a page.',
  path: '/compare/notion',
});

const comparison: Comparison = {
  name: 'Notion',
  creature: <OctopusMark className="size-20" />,
  species: 'The octopus',
  heading: 'NemoMemo vs. Notion',
  subheading: 'A workspace asks you to build. A timeline asks you to type one line and leave.',
  intro: [
    'Notion is a workspace: pages, databases, templates, and blocks that can model almost anything. That power is real — and it has a cost. Every thought you capture first answers a question: which page does this go on? What structure does it live in?',
    "NemoMemo deliberately has no answer to that question, because it never asks it. There is one timeline and one box. You open it, type, and leave. Structure comes later — from inline #tags and filters — or never, which for most quick notes is the right amount. And unlike a workspace in someone else's cloud, your timeline is one SQLite file on your own server, in plain Markdown you can take anywhere.",
  ],
  chooseThem: {
    lead: 'Stay with Notion if you need…',
    items: [
      'Documents, wikis, and databases with rich structure',
      'Team workspaces with granular page permissions',
      'Templates, integrations, and an app ecosystem',
      'Long-form writing and project management in one place',
    ],
  },
  chooseUs: {
    lead: 'Add NemoMemo if…',
    items: [
      'Your quick notes die in Notion because making a page feels like work',
      'You want your notes on your own server, not a vendor cloud',
      'Plain Markdown portability matters to you',
      'Half your notes only matter for a day — Dory handles those',
    ],
  },
  rows: [
    { label: 'Shape', them: 'Workspace: pages, databases, blocks', us: 'One timeline, one box' },
    { label: 'Where notes live', them: "Notion's cloud", us: 'Your server, one SQLite file' },
    { label: 'Format', them: 'Proprietary blocks', us: 'Plain Markdown' },
    { label: 'Capture cost', them: 'Pick a page, pick a structure', us: 'Type and go' },
    { label: 'Ephemeral notes', them: 'Manual cleanup', us: 'Dory memos (24h)' },
    { label: 'Price', them: 'Free tier, paid plans', us: 'Free to self-host' },
  ],
  closing:
    'These are different tools for different jobs, and plenty of people use both: Notion for the projects, NemoMemo for the stream of small thoughts that would otherwise be lost — or worse, filed.',
};

export default function Page() {
  return <CompareLayout comparison={comparison} />;
}
