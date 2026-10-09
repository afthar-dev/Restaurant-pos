type FoodType = 'VEG' | 'NON_VEG' | 'EGG';

export const FOOD_LABEL: Record<FoodType, string> = {
  VEG: 'Veg',
  NON_VEG: 'Non-veg',
  EGG: 'Egg',
};

const COLOR: Record<FoodType, string> = {
  VEG: 'var(--color-veg)',
  NON_VEG: 'var(--color-nonveg)',
  EGG: 'var(--color-egg)',
};

/**
 * The veg / non-veg / egg symbol Indian diners know from food packets: a square outline with
 * a filled circle (veg, egg) or triangle (non-veg).
 */
export function FoodMark({
  type,
  size = 16,
  className = '',
}: {
  type: FoodType;
  size?: 14 | 16;
  className?: string;
}) {
  return (
    <svg
      role="img"
      aria-label={FOOD_LABEL[type]}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={`shrink-0 ${className}`.trim()}
      style={{ color: COLOR[type] }}
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
      {type === 'NON_VEG' ? (
        <path d="M8 4.25 L11.75 11 H4.25 Z" fill="currentColor" />
      ) : (
        <circle cx="8" cy="8" r="3.5" fill="currentColor" />
      )}
    </svg>
  );
}
