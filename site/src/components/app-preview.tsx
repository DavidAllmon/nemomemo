/**
 * A hand-drawn "screenshot" of the app's timeline in the Deep Sea theme —
 * markup, not an image, so it stays crisp, themable, and costs no bytes.
 */

function Heatmap() {
  const cells = [
    0, 1, 2, 0, 3, 1, 0, //
    2, 0, 3, 1, 0, 2, 3,
  ];
  const fills = [
    'bg-[oklch(0.3_0.04_250)]',
    'bg-[oklch(0.45_0.1_48)]',
    'bg-[oklch(0.6_0.14_48)]',
    'bg-ocean-primary',
  ];
  return (
    <div className="grid grid-cols-7 gap-[3px]" aria-hidden>
      {cells.map((level, i) => (
        <div key={i} className={`h-2.5 rounded-[2px] ${fills[level]}`} />
      ))}
    </div>
  );
}

function DoryChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ocean-dory/50 px-2.5 py-0.5 text-xs font-extrabold text-ocean-dory">
      🐟 {label}
    </span>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-[oklch(0.3_0.06_48_/_0.4)] px-2.5 py-0.5 text-xs font-bold text-[oklch(0.72_0.13_48)]">
      {children}
    </span>
  );
}

export function AppPreview() {
  return (
    <div className="overflow-hidden rounded-t-2xl border border-b-0 border-[oklch(0.38_0.05_250)] bg-[oklch(0.24_0.04_250)] shadow-[0_-20px_120px_oklch(0.45_0.1_250_/_0.35)]">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-[oklch(0.32_0.04_250)] px-4 py-3">
        <div className="size-2.5 rounded-full bg-[oklch(0.45_0.04_250)]" />
        <div className="size-2.5 rounded-full bg-[oklch(0.45_0.04_250)]" />
        <div className="size-2.5 rounded-full bg-[oklch(0.45_0.04_250)]" />
        <div className="ml-4 rounded-md bg-[oklch(0.28_0.04_250)] px-3 py-0.5 text-xs text-ocean-muted">
          reef.yourdomain.com
        </div>
      </div>
      <div className="flex text-left">
        {/* sidebar */}
        <div className="hidden w-56 flex-col gap-4 border-r border-[oklch(0.32_0.04_250)] p-5 sm:flex">
          <div className="rounded-lg border border-ocean-border px-3 py-2 text-xs text-ocean-muted">
            Search the reef…
          </div>
          <div className="flex flex-col gap-2 text-sm font-bold">
            <span className="text-ocean-primary">Timeline</span>
            <span className="text-ocean-muted">Explore</span>
            <span className="text-ocean-muted">Archive</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-extrabold tracking-widest text-ocean-muted">TAGS</p>
            <span className="text-sm font-semibold text-[oklch(0.72_0.13_48)]">#homelab</span>
            <span className="text-sm font-semibold text-[oklch(0.72_0.13_48)]">#til</span>
            <span className="text-sm font-semibold text-[oklch(0.72_0.13_48)]">#bio/midterm</span>
          </div>
          <Heatmap />
        </div>
        {/* timeline */}
        <div className="flex flex-1 flex-col gap-3.5 p-5">
          <div className="rounded-xl border border-ocean-border px-4 py-3 text-sm text-ocean-muted">
            Any thoughts…
          </div>
          <div className="rounded-xl border border-[oklch(0.32_0.04_250)] bg-ocean-card p-4">
            <p className="text-xs text-ocean-muted">Today, 9:14 AM</p>
            <p className="mt-2 text-sm leading-relaxed">
              TIL:{' '}
              <code className="rounded bg-[oklch(0.3_0.045_250)] px-1.5 py-0.5 font-mono text-[13px]">
                sqlite3 .backup
              </code>{' '}
              takes a consistent snapshot even while the app is writing. Perfect for the nightly
              cron.
            </p>
            <div className="mt-2.5 flex gap-1.5">
              <Tag>#til</Tag>
              <Tag>#homelab</Tag>
            </div>
          </div>
          <div className="rounded-xl border border-ocean-dory/50 bg-[oklch(0.28_0.06_255_/_0.5)] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-ocean-muted">Today, 8:02 AM</p>
              <DoryChip label="forgets in 22h" />
            </div>
            <p className="mt-2 text-sm leading-relaxed">Parked on level 3, row F — near the elevator.</p>
          </div>
          <div className="rounded-xl border border-[oklch(0.32_0.04_250)] bg-ocean-card p-4">
            <p className="text-xs text-ocean-muted">Yesterday</p>
            <div className="mt-2 flex flex-col gap-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="flex size-4 items-center justify-center rounded bg-ocean-primary" aria-hidden>
                  <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="oklch(0.15 0.03 250)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6.5 4.5 9 10 3" />
                  </svg>
                </span>
                <span className="text-ocean-muted line-through">Renew the TLS certs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-4 rounded border-[1.5px] border-[oklch(0.45_0.035_250)]" aria-hidden />
                <span>Write up the backup runbook</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
