import { rupees } from '@/shared/lib/money';
import type { SalesReport } from '../types';

function Card({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span
        className={`text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-red-700' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function Split({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="Sales" value={rupees(summary.total)} />
        <Card label="Bills" value={String(summary.bills)} />
        <Card label="Average bill" value={rupees(summary.averageBill)} />
        <Card label="Expenses" value={rupees(summary.expenses.total)} />
        <Card
          label="Net"
          value={`${summary.net < 0 ? '−' : ''}${rupees(Math.abs(summary.net))}`}
          tone={summary.net < 0 ? 'bad' : undefined}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
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
            ['CGST', rupees(summary.cgst)],
            ['SGST', rupees(summary.sgst)],
          ]}
        />
      </div>
      {summary.expenses.byCategory.length > 0 && (
        <Split
          title="Expenses by category"
          rows={summary.expenses.byCategory.map((e) => [e.name, rupees(e.amount)])}
        />
      )}
    </div>
  );
}
