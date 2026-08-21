export function NemoMark({ className, bob = false }: { className?: string; bob?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 48"
      className={`${className ?? 'size-8'} ${bob ? 'animate-fish-bob' : ''}`}
      role="img"
      aria-label="NemoMemo"
    >
      <path
        d="M13 24c-5-6-9.5-8.5-12-9 2.6 3.4 2.6 14.6 0 18 2.5-.5 7-3 12-9z"
        fill="oklch(0.72 0.16 48)"
        stroke="oklch(0.35 0.06 45)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <ellipse
        cx="36"
        cy="24"
        rx="25"
        ry="16.5"
        fill="oklch(0.68 0.17 45)"
        stroke="oklch(0.35 0.06 45)"
        strokeWidth="2"
      />
      <path
        d="M30 8.5c2-3.5 8-4.5 11-3-2 1.5-3.2 3-3.8 4.6"
        fill="oklch(0.72 0.16 48)"
        stroke="oklch(0.35 0.06 45)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M27 8.6c-3.4 9.6-3.4 21.2 0 30.8 3.2-1 5.4-8 5.4-15.4S30.2 9.6 27 8.6z"
        fill="oklch(0.98 0.005 90)"
        stroke="oklch(0.35 0.06 45)"
        strokeWidth="1.6"
      />
      <path
        d="M45 10.8c-2.6 8-2.6 18.4 0 26.4 2.6-1.4 4.6-6.8 4.6-13.2s-2-11.8-4.6-13.2z"
        fill="oklch(0.98 0.005 90)"
        stroke="oklch(0.35 0.06 45)"
        strokeWidth="1.6"
      />
      <circle cx="53" cy="20" r="3.4" fill="oklch(0.25 0.02 250)" />
      <circle cx="54.2" cy="18.9" r="1.1" fill="white" />
      <path
        d="M56 28c-1.4 1.6-3.4 2.4-5.4 2.2"
        fill="none"
        stroke="oklch(0.35 0.06 45)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M36 26c3 1.4 4.6 4.4 4.2 7.6-3-.6-5.2-2.6-6.2-5.4"
        fill="oklch(0.72 0.16 48)"
        stroke="oklch(0.35 0.06 45)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
