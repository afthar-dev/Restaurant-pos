import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export type IconSize = 'sm' | 'md' | 'lg';

/** 16 px inline with text, 20 px in buttons and rows, 24 px in empty states and headers. */
export const ICON_SIZE: Record<IconSize, string> = { sm: 'size-4', md: 'size-5', lg: 'size-6' };

/** A lucide icon at one of the three kit sizes; decorative unless it has a label. */
export function Icon({
  as: Glyph,
  size = 'md',
  label,
  className,
}: {
  as: LucideIcon;
  size?: IconSize;
  label?: string;
  className?: string;
}) {
  return (
    <Glyph
      className={cn(ICON_SIZE[size], 'shrink-0', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
