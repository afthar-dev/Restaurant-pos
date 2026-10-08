import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartData } from './ChartData';
import { ChartTooltip } from './ChartTooltip';
import { CHART_ANIMATION_MS, prefersReducedMotion } from './motion';
import { niceTicks, shortRupees } from './scale';
import type { ChartPoint } from './types';

const AXIS_TICK = { fill: 'var(--color-subtle)', fontSize: 12 };

/** A filled line over the service hours; the busiest hour gets a dot. */
export function AreaTrend({
  title,
  points,
  height = 200,
}: {
  title: string;
  points: ChartPoint[];
  height?: number;
}) {
  const fade = useId();
  const ticks = niceTicks(Math.max(0, ...points.map((p) => p.value)));
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]!);
  const still = prefersReducedMotion();
  // Only points with a label get a tick, so Recharts' overlap check sees real text.
  const labelled = points.filter((p) => p.label).map((p) => p.key);
  const labelOf = (key: string) => points.find((p) => p.key === key)?.label ?? '';
  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} title={title} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          {/* Keyed by hour so the peak dot finds its place even when its label is thinned. */}
          <XAxis
            dataKey="key"
            ticks={labelled}
            // Skips labels that would touch on a narrow screen (needs real text widths).
            interval="preserveStartEnd"
            minTickGap={8}
            tickFormatter={labelOf}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border-strong)' }}
            tick={AXIS_TICK}
          />
          <YAxis
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]!]}
            tickFormatter={shortRupees}
            tickLine={false}
            axisLine={false}
            width={48}
            tick={AXIS_TICK}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border-strong)' }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-primary-600)"
            strokeWidth={2}
            fill={`url(#${fade})`}
            isAnimationActive={!still}
            animationDuration={CHART_ANIMATION_MS}
          />
          {peak.value > 0 && (
            <ReferenceDot
              x={peak.key}
              y={peak.value}
              r={5}
              fill="var(--color-primary-700)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      <ChartData title={title} points={points} />
    </div>
  );
}
