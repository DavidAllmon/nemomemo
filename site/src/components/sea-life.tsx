/**
 * The reef's supporting cast — hand-drawn SVG sea life in the same visual
 * language as NemoMark (simple shapes, 2px dark strokes, OKLCH fills), plus
 * the ocean scenery primitives (waves, bubbles, depth markers) the marketing
 * pages compose into underwater scenes.
 */

const STROKE = 'oklch(0.3 0.05 255)';

/** An octopus — many arms, does everything. The workspace of the sea. */
export function OctopusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? 'size-16'} role="img" aria-label="An octopus">
      <ellipse cx="32" cy="24" rx="17" ry="15" fill="oklch(0.62 0.14 320)" stroke={STROKE} strokeWidth="2" />
      <path d="M18 34c-3 8-9 12-14 12 3 3 9 3 13-1" fill="oklch(0.62 0.14 320)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 37c-1 9-5 15-10 18 4 1 10-2 12-8" fill="oklch(0.62 0.14 320)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M32 38c0 9-2 16-6 21 5-1 9-6 10-13" fill="oklch(0.62 0.14 320)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 37c2 8 6 14 11 17-5 2-11-2-13-8" fill="oklch(0.62 0.14 320)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M46 34c4 6 9 9 14 9-2 4-9 4-13 0" fill="oklch(0.62 0.14 320)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="26" cy="24" r="3" fill="oklch(0.25 0.02 250)" />
      <circle cx="27" cy="23" r="1" fill="white" />
      <circle cx="39" cy="24" r="3" fill="oklch(0.25 0.02 250)" />
      <circle cx="40" cy="23" r="1" fill="white" />
      <path d="M28 31c2.5 1.6 6.5 1.6 9 0" fill="none" stroke={STROKE} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A goldfish — quick and friendly, but it lives in someone else's bowl. */
export function GoldfishMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className ?? 'size-16'} role="img" aria-label="A goldfish">
      <path d="M14 24c-6-7-10-9-13-9 2 3.5 2 14.5 0 18 3 0 7-2 13-9z" fill="oklch(0.78 0.15 70)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="36" cy="24" rx="23" ry="15" fill="oklch(0.75 0.16 65)" stroke={STROKE} strokeWidth="2" />
      <path d="M32 10c1-4 5-6 9-5-2 2-3 4-3.4 6" fill="oklch(0.78 0.15 70)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M36 27c2.6 1.6 4 4.4 3.6 7.4-2.8-.6-4.8-2.4-5.8-5" fill="oklch(0.78 0.15 70)" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="51" cy="20" r="3.2" fill="oklch(0.25 0.02 250)" />
      <circle cx="52.2" cy="18.9" r="1" fill="white" />
      <path d="M54 28c-1.4 1.4-3.2 2-5 1.8" fill="none" stroke={STROKE} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A nautilus — a spiral vault of chambers, built one room at a time. */
export function NautilusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 56" className={className ?? 'size-16'} role="img" aria-label="A nautilus">
      <circle cx="30" cy="26" r="21" fill="oklch(0.85 0.06 75)" stroke={STROKE} strokeWidth="2" />
      <path d="M30 5a21 21 0 0 1 21 21h-8a13 13 0 0 0-13-13z" fill="oklch(0.7 0.1 50)" stroke={STROKE} strokeWidth="1.6" />
      <path d="M30 13a13 13 0 0 1 13 13 13 13 0 0 1-13 13 8 8 0 0 1-8-8 8 8 0 0 1 8-8 4 4 0 0 1 4 4" fill="none" stroke={STROKE} strokeWidth="1.6" />
      <path d="M49 32c4 2 8 6 9 10-4 0-8-1-11-4M49 36c2 4 2 9 1 12-3-2-6-6-6-10" fill="oklch(0.85 0.06 75)" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="51" cy="30" r="2.6" fill="oklch(0.25 0.02 250)" />
      <circle cx="52" cy="29.2" r="0.9" fill="white" />
    </svg>
  );
}

/** A striped reef fish — a friendly cousin from the same waters. */
export function ReefCousinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className ?? 'size-16'} role="img" aria-label="A striped reef fish">
      <path d="M13 24c-5-6-9.5-8.5-12-9 2.6 3.4 2.6 14.6 0 18 2.5-.5 7-3 12-9z" fill="oklch(0.62 0.1 210)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="36" cy="24" rx="25" ry="16.5" fill="oklch(0.58 0.11 200)" stroke={STROKE} strokeWidth="2" />
      <path d="M30 8.5c2-3.5 8-4.5 11-3-2 1.5-3.2 3-3.8 4.6" fill="oklch(0.62 0.1 210)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M27 8.6c-3.4 9.6-3.4 21.2 0 30.8 3.2-1 5.4-8 5.4-15.4S30.2 9.6 27 8.6z" fill="oklch(0.9 0.03 95)" stroke={STROKE} strokeWidth="1.6" />
      <path d="M45 10.8c-2.6 8-2.6 18.4 0 26.4 2.6-1.4 4.6-6.8 4.6-13.2s-2-11.8-4.6-13.2z" fill="oklch(0.9 0.03 95)" stroke={STROKE} strokeWidth="1.6" />
      <circle cx="53" cy="20" r="3.4" fill="oklch(0.25 0.02 250)" />
      <circle cx="54.2" cy="18.9" r="1.1" fill="white" />
      <path d="M56 28c-1.4 1.6-3.4 2.4-5.4 2.2" fill="none" stroke={STROKE} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A jellyfish — drifts through the open water sections. */
export function JellyfishMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 64" className={className ?? 'size-14'} role="img" aria-label="A jellyfish">
      <path d="M6 26a18 16 0 0 1 36 0c0 3-2 5-5 5H11c-3 0-5-2-5-5z" fill="oklch(0.72 0.11 300 / 0.75)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 33c-1 8 2 14-1 22M22 33c2 9-2 16 1 25M32 33c-1 7 3 13 0 21M40 33c1 6-1 12 1 17" fill="none" stroke="oklch(0.72 0.11 300 / 0.8)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="18" cy="20" r="2.2" fill="oklch(0.25 0.02 250)" />
      <circle cx="30" cy="20" r="2.2" fill="oklch(0.25 0.02 250)" />
      <path d="M20 26c2.4 1.4 5.6 1.4 8 0" fill="none" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** An anglerfish — the only light at the bottom of the page. */
export function AnglerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 56" className={className ?? 'size-16'} role="img" aria-label="An anglerfish with a glowing lure">
      <circle cx="52" cy="10" r="4" fill="oklch(0.88 0.14 95)">
        <title>lure</title>
      </circle>
      <circle cx="52" cy="10" r="7.5" fill="oklch(0.88 0.14 95 / 0.25)" />
      <path d="M52 14c-2 4-8 6-12 7" fill="none" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 32c-5-5-8-7-11-7.5 2 3 2 12 0 15 3-.5 6-2.5 11-7.5z" fill="oklch(0.35 0.05 250)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="36" cy="34" rx="26" ry="15" fill="oklch(0.32 0.05 255)" stroke={STROKE} strokeWidth="2" />
      <path d="M44 40c4 1.5 10 1.5 14-1-1 4-6 7-11 6" fill="oklch(0.35 0.05 250)" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="50" cy="30" r="3.6" fill="oklch(0.88 0.14 95)" />
      <circle cx="51" cy="29" r="1.2" fill="white" />
      <path d="M40 41c4 2.4 10 2.4 14 0" fill="none" stroke={STROKE} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M43 41l2 3M48 42.5l1.6 3M53 42l1.4 2.6" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Branching coral silhouette for reef-zone scenery. */
export function CoralSilhouette({ className, fill }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 80 64" className={className ?? 'h-16 w-20'} aria-hidden>
      <path
        d="M38 64V38c0-6-4-10-8-12 1 5-1 8-4 10 0-7-3-12-8-14 2 5 1 9-2 12-2-4-5-6-9-6 3 3 4 7 4 11 6 1 10 4 12 8-3-1-6-1-8 1 6 2 10 6 11 12h12zm6 0V30c0-8 4-13 10-15-2 5-1 9 2 12 1-6 4-10 9-11-2 4-2 8 0 11 2-3 5-5 9-5-3 4-4 8-4 12-6 1-11 4-13 9 3-1 6 0 8 2-7 1-12 5-13 12z"
        fill={fill ?? 'oklch(0.3 0.07 25 / 0.55)'}
      />
    </svg>
  );
}

/** Swaying seagrass silhouette. */
export function SeagrassSilhouette({ className, fill }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 48 64" className={className ?? 'h-16 w-12'} aria-hidden>
      <path
        d="M10 64c-2-14 0-26 6-36-8 6-11 14-11 20-2-10 1-22 9-30-1 9 1 12 3 16 1-12 4-20 10-26-2 8-1 14 1 20 3-8 7-13 13-15-5 8-7 16-6 24-3 2-6 6-7 11-1-4-3-7-6-9 1 8-1 17-3 25H10z"
        fill={fill ?? 'oklch(0.45 0.09 165 / 0.5)'}
      />
    </svg>
  );
}

/** A tiny fish silhouette; compose a few into a drifting school. */
export function TinyFish({ className, fill }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 24 12" className={className ?? 'h-3 w-6'} aria-hidden>
      <path d="M6 6C4 3.6 2 2.4 0 2c1 1.4 1 6.6 0 8 2-.4 4-1.6 6-4zm0 0c3-3.4 7-5 11-4.4C20.4 2.2 23 4 24 6c-1 2-3.6 3.8-7 4.4C13 11 9 9.4 6 6z" fill={fill ?? 'currentColor'} />
    </svg>
  );
}

/** A loose cluster of rising bubbles. Purely decorative. */
export function Bubbles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 72" className={className ?? 'h-16 w-9'} aria-hidden>
      <circle cx="12" cy="60" r="4" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <circle cx="24" cy="42" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <circle cx="10" cy="24" r="3" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <circle cx="22" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
    </svg>
  );
}

/**
 * A wave edge drawn in the NEXT section's background color; place at the very
 * bottom of a band so the following band appears to rise into it as water.
 */
export function WaveEdge({ fill, className }: { fill: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 56"
      preserveAspectRatio="none"
      className={`block h-10 w-full sm:h-14 ${className ?? ''}`}
      aria-hidden
    >
      <path
        d="M0 34 C 120 12, 240 52, 360 34 C 480 16, 600 50, 720 34 C 840 18, 960 52, 1080 34 C 1200 16, 1320 46, 1440 30 L 1440 56 L 0 56 Z"
        fill={fill}
      />
    </svg>
  );
}

/** A dive-log style depth marker: "· 15 m". */
export function DepthMarker({ depth, className }: { depth: string; className?: string }) {
  return (
    <p className={`font-mono text-xs font-bold tracking-[0.25em] uppercase opacity-70 ${className ?? ''}`}>
      ▾ {depth}
    </p>
  );
}
