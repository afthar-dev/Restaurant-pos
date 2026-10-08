import { cn } from '@/shared/lib/cn';
import { rupees } from '@/shared/lib/money';
import { ChartFrame } from './ChartFrame';

const MODES = [
  { key: 'CASH', label: 'Cash', swatch: 'bg-pay-cash' },
  { key: 'UPI', label: 'UPI', swatch: 'bg-pay-upi' },
  { key: 'CARD', label: 'Card', swatch: 'bg-pay-card' },
] as const;

type Payments = Record<(typeof MODES)[number]['key'], number>;

/** One 100% bar of cash, UPI and card, with every amount and share written out. */
export function PaymentMix({ payments }: { payments: Payments }) {
  const total = payments.CASH + payments.UPI + payments.CARD;
  if (total <= 0) return null;
  const rows = MODES.map((m) => ({
    ...m,
    amount: payments[m.key],
    percent: Math.round((payments[m.key] / total) * 100),
  }));
  const top = rows.reduce((a, b) => (b.amount > a.amount ? b : a));
  const summary = rows.map((r) => `${r.label} ${rupees(r.amount)} (${r.percent}%)`).join(', ');

  return (
    <ChartFrame title="How customers paid" takeaway={`Most paid by ${top.label}: ${top.percent}%`}>
      <div role="img" aria-label={summary} className="flex h-6 gap-0.5 overflow-hidden rounded-md">
        {rows
          .filter((r) => r.amount > 0)
          .map((r) => (
            <div key={r.key} className={r.swatch} style={{ flexGrow: r.amount, flexBasis: 0 }} />
          ))}
      </div>
      <ul aria-label="Payment modes" className="flex flex-col gap-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-sm', r.swatch)} />
            <span className="flex-1 text-text">{r.label}</span>
            <span className="font-medium tabular-nums">{rupees(r.amount)}</span>
            <span className="w-10 text-right text-muted tabular-nums">{`${r.percent}%`}</span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
