import { rupees } from '@/shared/lib/money';
import { GstTable, StatStrip } from '@/shared/ui';
import type { SalesReport } from '../types';

/** One breakdown inside the shared surface, divided from its neighbours by hairlines. */
function Split({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-4 text-sm">
      <h3 className="text-xs font-medium text-muted">{title}</h3>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <span>{label}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}

/** Headline numbers for the range: sales, bills, average, expenses, net, and the splits. */
export function SummaryCards({ summary }: { summary: SalesReport['summary'] }) {
  return (
    <div className="flex flex-col gap-3">
      <StatStrip
        label="Totals"
        items={[
          { label: 'Sales', value: rupees(summary.total), hint: 'Billed, not counting voids' },
          { label: 'Collected', value: rupees(summary.collected), hint: 'Paid so far' },
          ...(summary.unpaid > 0
            ? [{ label: 'Unpaid', value: rupees(summary.unpaid), hint: 'Billed, not paid yet' }]
            : []),
          { label: 'Bills', value: String(summary.bills) },
          { label: 'Average order', value: rupees(summary.averageOrder) },
          { label: 'Expenses', value: rupees(summary.expenses.total) },
          {
            label: 'After expenses',
            hint: 'Sales without GST, minus expenses',
            value: `${summary.net < 0 ? '−' : ''}${rupees(Math.abs(summary.net))}`,
            tone: summary.net < 0 ? 'danger' : undefined,
          },
        ]}
      />
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
        <Split
          title="Payments"
          rows={[
            ['Cash', rupees(summary.payments.CASH)],
            ['UPI', rupees(summary.payments.UPI)],
            ['Card', rupees(summary.payments.CARD)],
          ]}
        />
        <Split
          title="Order type"
          rows={[
            [`Dine-in (${summary.byType.DINE_IN.orders})`, rupees(summary.byType.DINE_IN.total)],
            [`Parcel (${summary.byType.PARCEL.orders})`, rupees(summary.byType.PARCEL.total)],
          ]}
        />
        <Split
          title="Tax and discounts"
          rows={[
            ['Discounts', rupees(summary.discounts)],
            ['Taxable', rupees(summary.taxable)],
            ['CGST', rupees(summary.cgst)],
            ['SGST', rupees(summary.sgst)],
          ]}
        />
      </div>
      {(summary.gstBreakup.length > 0 || summary.exempt > 0) && (
        <GstTable rates={summary.gstBreakup} exempt={summary.exempt} />
      )}
      {summary.expenses.byCategory.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Split
            title="Expenses by category"
            rows={summary.expenses.byCategory.map((e) => [e.name, rupees(e.amount)])}
          />
        </div>
      )}
    </div>
  );
}
