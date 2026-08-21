import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils.js';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-xl border border-input bg-card px-3 text-sm',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-xl border border-input bg-card px-3 py-2 text-sm',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-primary',
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Avatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn('size-8 rounded-lg object-cover', className)}
      />
    );
  }
  const hue = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0) * 7, 0) % 360;
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white',
        className,
      )}
      style={{ backgroundColor: `oklch(0.62 0.12 ${hue})` }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
