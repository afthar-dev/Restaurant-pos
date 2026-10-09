import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'primary';

export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted ring-border-strong',
  success: 'bg-green-50 text-green-800 ring-green-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  primary: 'bg-primary-50 text-primary-800 ring-primary-200',
};

/** A small label. Pass an icon with every status, so it never relies on colour alone. */
export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        '[&_svg]:size-3.5 [&_svg]:shrink-0',
        TONE_SOFT[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
