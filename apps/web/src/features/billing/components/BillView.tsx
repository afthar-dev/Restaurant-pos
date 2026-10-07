import { useState, type ReactNode } from 'react';
import { useCan } from '@/shared/session/store';
import { describeError, secondaryButton } from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
import type { Bill } from '@/features/orders/types';
import { DiscountSheet } from './DiscountSheet';
import { printBill } from '../printBill';

const percent = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;

export const STATUS_LABEL: Record<Bill['status'], string> = {
  OPEN: 'Unpaid',
  PAID: 'Paid',
  VOID: 'Void',
};

const MODE_LABEL = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' } as const;

function Row({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'text-base font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** One bill with the server's totals, and what staff can do with it. */
export function BillView({ bill, actions }: { bill: Bill; actions?: ReactNode }) {
  const canDiscount = useCan('discount.apply');
  const [discounting, setDiscounting] = useState(false);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const open = bill.status === 'OPEN';
  const discount = bill.itemDiscount + bill.billDiscount;

  async function print() {
    setPrintNote(null);
    try {
      const where = await printBill(bill.id);
      setPrintNote(where === 'queued' ? 'Sent to the bill printer.' : null);
    } catch (error) {
      setPrintNote(`Could not print: ${describeError(error)}`);
    }
  }

  return (
    <section
      aria-label={`Bill ${bill.billNo}`}
      className={`flex flex-col gap-2 rounded-lg border bg-white p-3 text-sm ${
        bill.status === 'VOID' ? 'border-slate-200 opacity-70' : 'border-slate-300'
      }`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          Bill {bill.billNo} <span className="font-normal text-slate-500">{bill.title}</span>
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            bill.status === 'PAID'
              ? 'bg-emerald-100 text-emerald-800'
              : bill.status === 'VOID'
                ? 'bg-slate-200 text-slate-700'
                : 'bg-amber-100 text-amber-900'
          }`}
        >
          {STATUS_LABEL[bill.status]}
        </span>
      </header>
      {bill.status === 'VOID' && bill.voidReason && (
        <p className="text-slate-600">Voided: {bill.voidReason}</p>
      )}

      <ul className="divide-y divide-slate-100">
        {bill.lines.map((l) => (
          <li key={l.id} className="py-1">
            <Row
              label={
                <>
                  {l.quantity} × {l.itemName}
                  {l.variantName !== 'Regular' && ` (${l.variantName})`}
                  {l.addons.length > 0 && (
                    <span className="block text-xs text-slate-500">
                      {l.addons.map((a) => a.name).join(', ')}
                    </span>
                  )}
                  {l.itemDiscount > 0 && (
                    <span className="block text-xs text-emerald-800">
                      {rupees(l.itemDiscount)} off
                    </span>
                  )}
                </>
              }
              value={rupees(l.lineTotal)}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-0.5 border-t border-slate-200 pt-2">
        <Row label="Subtotal" value={rupees(bill.grossSubtotal)} />
        {discount > 0 && (
          <Row
            label={bill.discountReason ? `Discount (${bill.discountReason})` : 'Discount'}
            value={`−${rupees(discount)}`}
          />
        )}
        {bill.packaging > 0 && <Row label="Packaging" value={rupees(bill.packaging)} />}
        {bill.taxBreakup.map((t) => (
          <div key={`${t.cgstBp}/${t.sgstBp}`} className="contents">
            <Row label={`CGST ${percent(t.cgstBp)}`} value={rupees(t.cgst)} />
            <Row label={`SGST ${percent(t.sgstBp)}`} value={rupees(t.sgst)} />
          </div>
        ))}
        {bill.roundOff !== 0 && (
          <Row
            label="Round off"
            value={`${bill.roundOff < 0 ? '−' : ''}${rupees(Math.abs(bill.roundOff))}`}
          />
        )}
        <Row label="Total" value={rupees(bill.total)} strong />
        {bill.payments.map((p) => (
          <Row
            key={p.id}
            label={`${MODE_LABEL[p.mode]}${p.reference ? ` · ${p.reference}` : ''}`}
            value={rupees(p.amount)}
          />
        ))}
        {open && bill.paid > 0 && <Row label="Due" value={rupees(bill.due)} strong />}
      </div>

      <div className="flex flex-wrap gap-2">
        {actions}
        {open && canDiscount && bill.payments.length === 0 && (
          <button
            type="button"
            className={`${secondaryButton} min-h-11`}
            onClick={() => setDiscounting(true)}
          >
            Discount
          </button>
        )}
        <button
          type="button"
          className={`${secondaryButton} min-h-11`}
          onClick={() => void print()}
        >
          Print
        </button>
      </div>
      {printNote && (
        <p role="status" className="text-xs text-slate-600">
          {printNote}
        </p>
      )}
      {discounting && <DiscountSheet bill={bill} onDone={() => setDiscounting(false)} />}
    </section>
  );
}
