import type { ChartPoint } from './types';

/**
 * Recharts tooltip content: the point's name, then its figures. It stays mounted as a live
 * region, so moving through a chart with the arrow keys reads each point aloud.
 */
export function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  const point = active ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined;
  const [name, ...figures] = point ? point.detail.split(' · ') : [];
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {point && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-overlay">
          <p className="font-semibold text-text">{name}</p>
          {figures.length > 0 && <p className="text-muted tabular-nums">{figures.join(' · ')}</p>}
        </div>
      )}
    </div>
  );
}
