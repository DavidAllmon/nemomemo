import { DoryMark } from '@/components/dory-mark';
import { Bubbles } from '@/components/sea-life';

/**
 * "The life of a memo" — the Dory story told in three beats that scroll
 * normally with the page (no pinning): written → with Dory → forgotten.
 */

const BEATS: {
  status: string;
  statusClass: string;
  chip: string | null;
  body: string | null;
  note: string;
}[] = [
  {
    status: 'fresh',
    statusClass: 'text-ocean-ink',
    chip: null,
    body: 'Parked on level 3, row F — near the elevator.',
    note: 'a thought hits. one line, no folder, no title — the timeline catches it.',
  },
  {
    status: 'with dory',
    statusClass: 'text-ocean-dory',
    chip: '🐟 forgets in 23h',
    body: 'Parked on level 3, row F — near the elevator.',
    note: 'it only matters for a day, so you tap the blue tang. a countdown starts; you never think about it again.',
  },
  {
    status: 'forgotten',
    statusClass: 'text-ocean-muted',
    chip: null,
    body: null,
    note: 'gone for good at the 24-hour mark — comments, attachments, share links and all. archiving would have rescued it forever.',
  },
];

export function MemoLife() {
  return (
    <section aria-label="The life of a Dory memo" className="mt-20">
      <p className="font-mono text-[13px]" data-reveal>
        <span className="font-bold text-ocean-primary">## THE LIFE OF A MEMO</span>{' '}
        <span className="text-ocean-muted">— scrolling is optional. forgetting is not.</span>
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3" data-reveal="stagger">
        {BEATS.map((beat, index) => (
          <div key={beat.status} className="flex flex-col border border-ocean-border bg-ocean-bg/70">
            <div className="flex items-baseline justify-between border-b border-ocean-border px-4 py-2.5 font-mono text-xs">
              <span className="text-ocean-muted">
                [{index + 1}/3] status: <span className={`font-bold ${beat.statusClass}`}>{beat.status}</span>
              </span>
              {index === 1 ? <DoryMark className="animate-float h-5 w-8 shrink-0 self-center" /> : null}
            </div>
            <div className="flex flex-1 flex-col px-4 py-4">
              <div
                className={`rounded-lg border p-3.5 ${
                  index === 1 ? 'border-ocean-dory/50 bg-ocean-card/80' : 'border-[oklch(0.32_0.04_252)] bg-ocean-card/80'
                } ${index === 2 ? 'flex min-h-24 items-center justify-center border-dashed bg-transparent' : ''}`}
              >
                {beat.chip ? (
                  <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-ocean-dory/50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-ocean-dory">
                    {beat.chip}
                  </span>
                ) : null}
                {beat.body ? (
                  <p className="text-sm leading-relaxed">{beat.body}</p>
                ) : (
                  <div className="flex items-center gap-2 font-mono text-[13px] text-ocean-muted">
                    <Bubbles className="h-8 w-4 text-ocean-blue" />
                    forgotten. on purpose. 🫧
                  </div>
                )}
              </div>
              <p className="mt-3 font-mono text-[12px] leading-relaxed text-ocean-muted">{beat.note}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
