import { formatPaise } from '@rpos/shared';
import type { DayReport } from './types';
import { escapeHtml } from '@/shared/lib/escape';
import { PRINT_TIME_ZONE } from '@/shared/lib/when';

const row = (label: string, value: string, strong = false) =>
  `<div class="row${strong ? ' strong' : ''}"><span>${label}</span><span>${value}</span></div>`;

const MODE_NAME = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' } as const;

const section = (title: string, body: string) =>
  body ? `<hr><div class="head">${title}</div>${body}` : '';

/** The day-close report (spec §5.5) on the counter's thermal roll. */
export function renderDayReport(r: DayReport, outletName: string, paperWidthMm = 80): string {
  const e = escapeHtml;
  const money = (paise: number) => e(formatPaise(paise));
  const when = (iso: string | null) =>
    iso
      ? e(
          new Date(iso).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: PRINT_TIME_ZONE,
          }),
        )
      : '—';
  const variance = r.cash.variance;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Day report</title><style>
@page { size: ${paperWidthMm}mm auto; margin: 2mm; }
body { width: ${paperWidthMm - 4}mm; margin: 0; font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #000; }
.center { text-align: center; }
.name { font-size: 16px; font-weight: 700; }
.head { font-weight: 700; margin-bottom: 2px; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.strong { font-weight: 700; }
hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
</style></head><body>
<div class="center name">${e(outletName)}</div>
<div class="center">Day report</div>
${row('Opened', when(r.day.openedAt))}
${row('Closed', when(r.day.closedAt))}
${r.day.closedBy ? row('Closed by', e(r.day.closedBy.name)) : ''}
${section(
  'Sales',
  [
    row('Bills', String(r.sales.bills)),
    row('Gross', money(r.sales.grossSubtotal)),
    row('Discounts', money(r.sales.discounts)),
    row('Packaging', money(r.sales.packaging)),
    row('Taxable', money(r.sales.taxable)),
    r.sales.exempt > 0 ? row('No GST sales', money(r.sales.exempt)) : '',
    ...r.sales.gstBreakup.map((g) =>
      row(`GST ${g.ratePercent}% on ${money(g.taxable)}`, money(g.cgst + g.sgst)),
    ),
    row('CGST', money(r.sales.cgst)),
    row('SGST', money(r.sales.sgst)),
    row('Round off', money(r.sales.roundOff)),
    row('Total', money(r.sales.total), true),
    row('Collected', money(r.sales.collected)),
    r.sales.unpaid > 0 ? row('Unpaid', money(r.sales.unpaid)) : '',
  ].join(''),
)}
${section(
  'Payments',
  [
    row('Cash', money(r.payments.CASH)),
    row('UPI', money(r.payments.UPI)),
    row('Card', money(r.payments.CARD)),
  ].join(''),
)}
${section(
  'Refunds',
  r.refunds.total > 0
    ? [
        row('Total refunded', money(r.refunds.total), true),
        r.refunds.CASH > 0 ? row('Cash', money(r.refunds.CASH)) : '',
        r.refunds.UPI > 0 ? row('UPI', money(r.refunds.UPI)) : '',
        r.refunds.CARD > 0 ? row('Card', money(r.refunds.CARD)) : '',
        ...r.refunds.bills.map((b) =>
          row(`Bill ${b.billNo} · ${b.modes.map((m) => MODE_NAME[m]).join(', ')}`, money(b.amount)),
        ),
      ].join('')
    : '',
)}
${section(
  'Orders',
  [
    row(`Dine-in (${r.byType.DINE_IN.orders})`, money(r.byType.DINE_IN.total)),
    row(`Parcel (${r.byType.PARCEL.orders})`, money(r.byType.PARCEL.total)),
  ].join(''),
)}
${section(
  'Top items',
  r.topItems
    .map((i) =>
      row(
        `${i.quantity} × ${e(i.variantName === 'Regular' ? i.itemName : `${i.itemName} (${i.variantName})`)}`,
        money(i.amount),
      ),
    )
    .join(''),
)}
${section(
  'Voided bills',
  r.voids
    .map((v) => row(`Bill ${v.billNo}${v.reason ? ` · ${e(v.reason)}` : ''}`, money(v.total)))
    .join(''),
)}
${section(
  'Cancelled dishes',
  r.cancels
    .map((c) => row(`${c.quantity} × ${e(c.itemName)}`, c.reason ? e(c.reason) : ''))
    .join(''),
)}
${section(
  'Discounts',
  r.discounts
    .map((d) => row(`Bill ${d.billNo}${d.reason ? ` · ${e(d.reason)}` : ''}`, money(d.amount)))
    .join(''),
)}
${section('Expenses', r.expenses.byCategory.map((x) => row(e(x.name), money(x.amount))).join(''))}
${section(
  'Cash',
  [
    row('Opening', money(r.cash.opening)),
    row('Cash sales', money(r.cash.cashSales)),
    r.cash.cashRefunds > 0 ? row('Cash refunded', money(r.cash.cashRefunds)) : '',
    row('Cash expenses', money(r.cash.cashExpenses)),
    row('Expected in drawer', money(r.cash.expected), true),
    r.cash.counted !== null ? row('Counted', money(r.cash.counted)) : '',
    variance !== null ? row('Variance', money(variance), true) : '',
  ].join(''),
)}
${r.day.closeNote ? `<hr><div>Note: ${e(r.day.closeNote)}</div>` : ''}
</body></html>`;
}
