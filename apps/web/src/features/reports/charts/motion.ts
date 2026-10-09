/** True when the person asked for less motion, or when we cannot tell (tests, old browsers). */
export function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const CHART_ANIMATION_MS = 400;
