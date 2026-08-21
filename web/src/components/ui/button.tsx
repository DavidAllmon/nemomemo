import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils.js';

export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'icon';

const variants: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
  ghost: 'hover:bg-accent text-foreground',
  outline: 'border border-border bg-transparent hover:bg-accent',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-lg',
  md: 'h-9 px-4 text-sm rounded-xl',
  icon: 'h-8 w-8 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
