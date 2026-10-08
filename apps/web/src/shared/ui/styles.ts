import { cn } from '@/shared/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap ' +
  'transition-colors select-none disabled:cursor-not-allowed disabled:opacity-55 ' +
  '[&_svg]:size-4 [&_svg]:shrink-0';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary-700 text-white shadow-sm hover:bg-primary-800 active:bg-primary-900',
  secondary:
    'border border-border-strong bg-surface text-text shadow-sm hover:bg-surface-2 active:bg-slate-200',
  ghost: 'text-text hover:bg-surface-2 active:bg-slate-200',
  danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 active:bg-red-900',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-13 px-5 text-base',
};

/** Classes for a button-looking element (also used for links styled as buttons). */
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md') =>
  cn(base, variants[variant], sizes[size]);

export const inputClass =
  'min-h-11 rounded-md border border-border-strong bg-surface px-3 py-2 text-base ' +
  'text-text placeholder:text-subtle shadow-xs transition-colors ' +
  'focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30 ' +
  'aria-invalid:border-red-600 aria-invalid:focus:ring-red-600/30 ' +
  'disabled:bg-surface-2 disabled:text-subtle';

// Older names kept for screens built before the kit; they now share the kit's look.
export const primaryButton = buttonClass('primary', 'md');
export const secondaryButton = buttonClass('secondary', 'md');
export const dangerButton = buttonClass('danger', 'md');
