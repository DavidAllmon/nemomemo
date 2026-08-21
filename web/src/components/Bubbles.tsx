import { useEffect, useState } from 'react';

/**
 * The save moment: a short burst of rising bubbles. Render with a changing
 * `burstKey` to replay; respects prefers-reduced-motion via the CSS class.
 */
export function Bubbles({ burstKey }: { burstKey: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (burstKey === 0) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, [burstKey]);

  if (!visible) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 overflow-visible">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={`${burstKey}-${i}`}
          className="bubble absolute bottom-0 rounded-full border border-ocean/50 bg-ocean-soft/70"
          style={{
            left: `${18 + i * 16}%`,
            width: `${8 + (i % 3) * 4}px`,
            height: `${8 + (i % 3) * 4}px`,
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}
