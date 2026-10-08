import type { ChartPoint } from './types';

/** The chart's points as text, for screen readers; the SVG itself is for sighted people. */
export function ChartData({ title, points }: { title: string; points: ChartPoint[] }) {
  return (
    <ul aria-label={`${title} data`} className="sr-only">
      {points.map((p) => (
        <li key={p.key}>{p.detail}</li>
      ))}
    </ul>
  );
}
