import type { FoodType } from '@rpos/shared';
import { cn } from '@/shared/lib/cn';

const MARK: Record<FoodType, { label: string; color: string }> = {
  VEG: { label: 'Veg', color: 'var(--color-veg)' },
  NON_VEG: { label: 'Non-veg', color: 'var(--color-nonveg)' },
  EGG: { label: 'Egg', color: 'var(--color-egg)' },
};

/**
 * The veg / non-veg / egg symbol Indian diners know from food packets: a square outline with
 * a filled circle (veg), a ring (egg) or a triangle (non-veg).
 * Twin of apps/qr/src/shared/ui/FoodMark.tsx; keep the two drawings the same.
 */
export function FoodMark({
  type,
  size = 14,
  className,
}: {
  type: FoodType;
  size?: 14 | 16;
  className?: string;
}) {
  const mark = MARK[type];
  return (
    <svg
      role="img"
      aria-label={mark.label}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      style={{ color: mark.color }}
    >
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {type === 'NON_VEG' && <path d="M8 4.25 L11.75 11 H4.25 Z" fill="currentColor" />}
      {type === 'VEG' && <circle cx="8" cy="8" r="3.5" fill="currentColor" />}
      {/* Egg is a ring, so it differs from veg by shape and not only by colour. */}
      {type === 'EGG' && (
        <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.75" />
      )}
    </svg>
  );
}
