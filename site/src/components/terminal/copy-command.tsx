'use client';

import { useState } from 'react';

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard unavailable — leave the label as-is
        }
      }}
      className="font-mono text-xs font-semibold text-ocean-primary transition-opacity hover:opacity-80"
    >
      {copied ? '[copied ✓]' : '[copy]'}
    </button>
  );
}
