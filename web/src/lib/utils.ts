import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function relativeTime(epochSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - epochSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return 'yesterday';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: diff > 86400 * 330 ? 'numeric' : undefined,
  });
}

export function absoluteTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** "Dory forgets this in 23h" — human countdown for a forgetAt epoch. */
export function forgetCountdown(forgetAt: number): string {
  const remaining = forgetAt - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return 'any moment now';
  if (remaining < 60) return `${remaining}s`;
  if (remaining < 3600) return `${Math.ceil(remaining / 60)}m`;
  if (remaining >= 48 * 3600) return `${Math.ceil(remaining / 86_400)}d`;
  return `${Math.ceil(remaining / 3600)}h`;
}

/** Epoch seconds → value for an <input type="datetime-local"> (local time). */
export function epochToLocalInput(epoch: number): string {
  const date = new Date(epoch * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value → epoch seconds (NaN-safe: 0 when empty). */
export function localInputToEpoch(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/** Card opacity for a Dory memo: fades from 1 -> 0.45 over the final 6 hours. */
export function doryOpacity(forgetAt: number | null): number {
  if (forgetAt == null) return 1;
  const remaining = forgetAt - Math.floor(Date.now() / 1000);
  const fadeWindow = 6 * 3600;
  if (remaining >= fadeWindow) return 1;
  if (remaining <= 0) return 0.45;
  return 0.45 + 0.55 * (remaining / fadeWindow);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
