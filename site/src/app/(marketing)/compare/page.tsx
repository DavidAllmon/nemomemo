import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Compare' };

const ROWS = [
  { label: 'License', nemo: 'ELv2 — source-available, free to self-host', others: 'Varies — often proprietary' },
  { label: 'Where your notes live', nemo: 'Your server, one SQLite file', others: 'Their cloud' },
  { label: 'Cost', nemo: '$0 forever', others: 'Free tiers with paid ceilings' },
  { label: 'Format', nemo: 'Plain Markdown', others: 'Proprietary blocks/databases' },
  { label: 'Ephemeral notes', nemo: 'Built in (Dory memos, 24h)', others: 'Manual cleanup' },
  { label: 'Personality', nemo: 'A clownfish', others: 'A productivity gradient' },
];

const GUIDES = [
  {
    name: 'vs. Memos',
    body: 'NemoMemo is a loving recreation of Memos with a playful identity and Dory memos. Memos is more mature — SSO, S3 storage, webhooks, RSS, 40+ languages, a web clipper, and an MCP server. If you need those today, run Memos (seriously, it is excellent). If you want the cute reef and self-forgetting notes, you are home.',
  },
  {
    name: 'vs. Notion',
    body: 'Notion is a workspace: databases, wikis, docs, dashboards. NemoMemo is one timeline. If your notes need relations and rollups, use Notion. If your notes die in Notion because making a page feels like work, use NemoMemo.',
  },
  {
    name: 'vs. Google Keep',
    body: 'Keep is fast and free but lives in Google’s cloud and exports poorly. NemoMemo is just as fast, writes real Markdown, and never leaves your server.',
  },
  {
    name: 'vs. Obsidian',
    body: 'Obsidian is a knowledge base for building a permanent, linked vault. NemoMemo is for the notes that come before (or instead of) all that structure. Many people happily run both.',
  },
];

export default function ComparePage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <h1 className="text-center font-display text-4xl font-bold">The job, not the feature count</h1>
      <p className="mt-3 text-center text-lg text-ocean-muted">
        NemoMemo does one thing: quick, private capture with permission to forget.
      </p>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-ocean-border">
        <table className="w-full bg-ocean-card text-sm">
          <thead>
            <tr className="border-b border-ocean-border text-left">
              <th className="p-3" />
              <th className="p-3 font-display">NemoMemo 🐠</th>
              <th className="p-3 font-display">Typical notes apps</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-ocean-border last:border-0">
                <td className="p-3 font-semibold">{row.label}</td>
                <td className="p-3">{row.nemo}</td>
                <td className="p-3 text-ocean-muted">{row.others}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        {GUIDES.map((guide) => (
          <div key={guide.name} className="rounded-2xl border border-ocean-border bg-ocean-card p-5">
            <p className="font-display text-lg font-bold">{guide.name}</p>
            <p className="mt-1.5 text-sm text-ocean-muted">{guide.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
