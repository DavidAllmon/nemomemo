/** Dory the blue tang — companion mark to NemoMark, same hand-drawn style. */
export function DoryMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 44" className={className ?? 'size-16'} role="img" aria-label="Dory">
      <path
        d="M50 22c6-4 9-9 10-12-4 .5-9 3-12 6"
        fill="oklch(0.82 0.15 90)"
        stroke="oklch(0.3 0.05 255)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M50 22c6 4 9 9 10 12-4-.5-9-3-12-6"
        fill="oklch(0.82 0.15 90)"
        stroke="oklch(0.3 0.05 255)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <ellipse
        cx="28"
        cy="22"
        rx="24"
        ry="15"
        fill="oklch(0.55 0.15 255)"
        stroke="oklch(0.3 0.05 255)"
        strokeWidth="2"
      />
      <path d="M24 9c8 4 12 18 4 26-6-2-10-8-10-13s2-10 6-13z" fill="oklch(0.32 0.06 260)" opacity="0.85" />
      <circle cx="12" cy="18" r="3" fill="oklch(0.25 0.02 250)" />
      <circle cx="13" cy="17" r="1" fill="white" />
      <path
        d="M8 26c1.6 1.4 3.6 2 5.6 1.6"
        fill="none"
        stroke="oklch(0.3 0.05 255)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
