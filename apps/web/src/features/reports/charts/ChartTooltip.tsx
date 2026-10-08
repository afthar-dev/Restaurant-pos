import type { ChartPoint } from './types';

/** Recharts tooltip content: the point's name, then its figures. */
export function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  const [name, ...figures] = point.detail.split(' · ');
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-overlay">
      <p className="font-semibold text-text">{name}</p>
      {figures.length > 0 && <p className="text-muted tabular-nums">{figures.join(' · ')}</p>}
    </div>
  );
}
