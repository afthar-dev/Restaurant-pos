import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

/** Vertical bars from a zero baseline; `compact` drops the axes and grid for small cards. */
export function ColumnChart({
  title,
  points,
  height = 200,
  compact = false,
}: {
  title: string;
  points: ChartPoint[];
  height?: number;
  compact?: boolean;
}) {
  const ticks = niceTicks(Math.max(0, ...points.map((p) => p.value)));
  const still = prefersReducedMotion();
  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={points} title={title} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          {!compact && <CartesianGrid vertical={false} stroke="var(--color-border)" />}
          <XAxis
            dataKey="label"
            interval={0}
            hide={compact}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border-strong)' }}
            tick={AXIS_TICK}
          />
          <YAxis
            hide={compact}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]!]}
            tickFormatter={shortRupees}
            tickLine={false}
            axisLine={false}
            width={48}
            tick={AXIS_TICK}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-2)' }} />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={!still}
            animationDuration={CHART_ANIMATION_MS}
          >
            {points.map((p) => (
              <Cell
                key={p.key}
                // 600 keeps 3:1 against white; the highlighted bar is darker still.
                fill={p.highlight ? 'var(--color-primary-900)' : 'var(--color-primary-600)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ChartData title={title} points={points} />
    </div>
  );
}

export default ColumnChart;
