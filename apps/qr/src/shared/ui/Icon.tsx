import type { LucideIcon } from 'lucide-react';

export type IconSize = 'sm' | 'md' | 'lg';

/** 16 px inline with text, 20 px in buttons and rows, 24 px in headers. */
const ICON_SIZE: Record<IconSize, string> = { sm: 'size-4', md: 'size-5', lg: 'size-6' };

/**
 * A lucide icon at one of three sizes; decorative unless it has a label.
 * Twin of apps/web/src/shared/ui/Icon.tsx.
 */
export function Icon({
  as: Glyph,
  size = 'md',
  label,
  className = '',
}: {
  as: LucideIcon;
  size?: IconSize;
  label?: string;
  className?: string;
}) {
  return (
    <Glyph
      className={`${ICON_SIZE[size]} shrink-0 ${className}`.trim()}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
