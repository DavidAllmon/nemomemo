import { DoryMark } from '@/components/dory-mark';
import { Bubbles } from '@/components/sea-life';

/**
 * "The life of a memo" — a pinned, scroll-driven story scene (Pudding-style
 * scrollytelling): as the reader scrolls, a memo is written, handed to Dory,
 * counts down, and dissolves into bubbles. Choreography lives in global.css
 * (.scrolly / .fx-*); browsers without scroll-timeline support and
 * reduced-motion readers get the static three-beat fallback instead.
 */

function MemoCard({ className }: { className?: string }) {
  return (
    <div
      className={`w-[min(34rem,88vw)] rounded-xl border border-[oklch(0.34_0.045_250)] bg-ocean-card/95 p-6 shadow-[0_24px_80px_oklch(0.08_0.02_255_/_0.6)] ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ocean-muted">Today, 8:02 AM</p>
        <span className="fx fx-chip inline-flex items-center gap-1.5 rounded-full border border-ocean-dory/60 px-3 py-1 text-[13px] font-extrabold text-ocean-dory">
          🐟 forgets in
          <span className="inline-grid text-left">
            <span className="fx fx-count-a [grid-area:1/1]">23h</span>
            <span className="fx fx-count-b [grid-area:1/1]">3h</span>
            <span className="fx fx-count-c [grid-area:1/1]">47m</span>
          </span>
        </span>
      </div>
      <p className="fx fx-card-text mt-3 text-lg leading-relaxed">
        Parked on level 3, row F — near the elevator.
      </p>
    </div>
  );
}

function Caption({
  step,
  top,
  title,
  children,
}: {
  step: string;
  top: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="scrolly-caption" style={{ top }}>
      <div className="border border-ocean-border bg-ocean-bg/95 p-5">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-ocean-blue">
          {step}
        </p>
        <p className="mt-2 font-mono text-[15px] font-bold">{title}</p>
        <p className="mt-1.5 font-mono text-[12.5px] leading-relaxed text-ocean-muted">{children}</p>
      </div>
    </div>
  );
}

export function MemoLife() {
  return (
    <section aria-label="The life of a Dory memo">
      {/* ——— Enhanced: pinned scroll-driven scene ——— */}
      <div className="scrolly">
        <div className="scrolly-stage">
          {/* corner status chip (à la Pudding's state indicator) */}
          <div className="absolute right-5 top-20 z-20 border border-ocean-border bg-ocean-bg/90 px-4 py-2 font-mono text-xs font-bold sm:right-10">
            <span className="text-ocean-muted">status:&nbsp;</span>
            <span className="inline-grid text-left align-bottom">
              <span className="fx fx-status-fresh [grid-area:1/1] text-ocean-ink">fresh</span>
              <span className="fx fx-status-dory [grid-area:1/1] text-ocean-dory">with Dory</span>
              <span className="fx fx-status-forgotten [grid-area:1/1] text-ocean-muted">
                forgotten
              </span>
            </span>
          </div>

          <p className="absolute left-1/2 top-[5.5rem] z-20 -translate-x-1/2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-ocean-muted">
            The life of a memo
          </p>

          {/* the memo */}
          <div className="fx fx-card relative z-10">
            <MemoCard />
          </div>

          {/* Dory swims through */}
          <div className="fx fx-dory absolute z-0 mt-44">
            <DoryMark className="h-16 w-24" />
          </div>

          {/* the forgetting */}
          <Bubbles className="fx fx-bubbles absolute z-10 h-24 w-12 text-ocean-blue" />
          <div className="fx fx-gone absolute z-10 text-center">
            <p className="font-mono text-3xl font-bold sm:text-4xl">Forgotten. On purpose. 🫧</p>
            <p className="mt-3 font-mono text-[13px] text-ocean-muted">
              (archiving would have rescued it forever — your call.)
            </p>
          </div>
        </div>

        {/* step captions that scroll past the pinned stage */}
        <Caption step="Step 01" top="112vh" title="A thought hits.">
          Open the reef, type one line, done. No page to pick, no folder, no title — the timeline
          catches it.
        </Caption>
        <Caption step="Step 02" top="195vh" title="It only matters for a day.">
          So you tap the little blue tang. Dory takes it from here — a friendly countdown starts.
        </Caption>
        <Caption step="Step 03" top="278vh" title="You never think about it again.">
          No cleanup chore, no tidy-up guilt. The memo simply runs out of time.
        </Caption>
        <Caption step="Step 04" top="361vh" title="Gone. Actually gone.">
          The server deletes it for good — comments, attachments, and share links included. Your
          timeline stays clean.
        </Caption>
      </div>

      {/* ——— Fallback: the same story in three beats ——— */}
      <div className="scrolly-fallback">
        <div className="mx-auto w-full max-w-5xl px-4 py-20">
          <p className="text-center font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-ocean-muted">
            The life of a memo
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              {
                status: 'fresh',
                chip: null,
                body: 'Parked on level 3, row F — near the elevator.',
                note: 'A thought hits. One line, no folder, no title.',
              },
              {
                status: 'with Dory',
                chip: '🐟 forgets in 23h',
                body: 'Parked on level 3, row F — near the elevator.',
                note: 'It only matters for a day, so Dory gets it. A countdown starts.',
              },
              {
                status: 'forgotten',
                chip: null,
                body: null,
                note: 'Gone for good — comments, attachments, share links and all.',
              },
            ].map((beat) => (
              <div key={beat.status} className="flex flex-col">
                <p className="font-mono text-xs font-bold text-ocean-muted">status: {beat.status}</p>
                <div className="mt-2 flex-1 rounded-2xl border border-ocean-border bg-ocean-card p-5">
                  {beat.chip ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-ocean-dory/60 px-2.5 py-0.5 text-xs font-extrabold text-ocean-dory">
                      {beat.chip}
                    </span>
                  ) : null}
                  {beat.body ? (
                    <p className="mt-2 text-sm leading-relaxed">{beat.body}</p>
                  ) : (
                    <p className="mt-2 text-sm italic text-ocean-muted">
                      Forgotten. On purpose. 🫧
                    </p>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ocean-muted">{beat.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
