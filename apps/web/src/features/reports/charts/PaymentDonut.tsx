import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/shared/lib/cn';
import { rupees } from '@/shared/lib/money';
import { ChartFrame } from './ChartFrame';
import { CHART_ANIMATION_MS, prefersReducedMotion } from './motion';

const MODES = [
  { key: 'CASH', label: 'Cash', color: 'var(--color-pay-cash)', swatch: 'bg-pay-cash' },
  { key: 'UPI', label: 'UPI', color: 'var(--color-pay-upi)', swatch: 'bg-pay-upi' },
  { key: 'CARD', label: 'Card', color: 'var(--color-pay-card)', swatch: 'bg-pay-card' },
] as const;

type Payments = Record<(typeof MODES)[number]['key'], number>;

/** A donut of cash, UPI and card with the total inside, and every amount and share listed. */
export function PaymentDonut({ payments }: { payments: Payments }) {
  const total = payments.CASH + payments.UPI + payments.CARD;
  if (total <= 0) return null;
  const rows = MODES.map((m) => ({
    ...m,
    amount: payments[m.key],
    percent: Math.round((payments[m.key] / total) * 100),
  }));
  const top = rows.reduce((a, b) => (b.amount > a.amount ? b : a));
  const used = rows.filter((r) => r.amount > 0);
  const still = prefersReducedMotion();

  return (
    <ChartFrame title="How customers paid" takeaway={`Most paid by ${top.label}: ${top.percent}%`}>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        {/* The legend says everything the ring shows, so the ring is hidden from screen readers. */}
        <div className="relative size-44 shrink-0" aria-hidden="true">
          <ResponsiveContainer width="100%" height={176}>
            <PieChart accessibilityLayer={false}>
              <Pie
                data={used}
                dataKey="amount"
                nameKey="label"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={used.length > 1 ? 2 : 0}
                cornerRadius={4}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                isAnimationActive={!still}
                animationDuration={CHART_ANIMATION_MS}
              >
                {used.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums">{rupees(total)}</span>
            <span className="text-xs text-muted">paid</span>
          </div>
        </div>
        <ul aria-label="Payment modes" className="flex w-full flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-sm', r.swatch)} />
              <span className="flex-1 text-text">{r.label}</span>
              <span className="font-medium tabular-nums">{rupees(r.amount)}</span>
              <span className="w-10 text-right text-muted tabular-nums">{`${r.percent}%`}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}
