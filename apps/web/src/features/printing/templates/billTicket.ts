import { formatPaise, upiLink, type PaymentMode, type TaxScheme } from '@rpos/shared';
import { escapeHtml } from '@/shared/lib/escape';
import { qrSvg } from '@/shared/lib/qrSvg';
import { PRINT_TIME_ZONE } from '@/shared/lib/when';

/** Mirrors PrintService.buildBillPayload() in the API. */
export interface BillPrintPayload {
  kind: 'BILL';
  /** 0 is the original bill, n >= 1 the nth reprint. */
  copy: number;
  taxScheme: TaxScheme;
  outlet: {
    name: string;
    address: string | null;
    phone: string | null;
    gstin: string | null;
    fssaiNumber: string | null;
    billHeader: string | null;
    billFooter: string | null;
    /** Restaurant logo; a relative /api/media path when photos are stored on the server. */
    logoUrl: string | null;
    /** The UPI ID and payee behind the QR on an unpaid bill; older payloads have neither. */
    upiVpa?: string | null;
    upiPayee?: string | null;
    /** Missing counts as on, like the outlet setting's default. */
    printUpiQr?: boolean;
  };
  billNo: number;
  financialYear: string;
  status: 'OPEN' | 'PAID' | 'VOID';
  createdAt: string;
  cashierName: string;
  waiterName: string | null;
  orderType: 'DINE_IN' | 'PARCEL';
  tableName: string | null;
  tokenNo: number | null;
  customerName: string | null;
  guests: number | null;
  paperWidthMm: number;
  lines: {
    itemName: string;
    variantName: string;
    addons: string[];
    quantity: number;
    unitPrice: number;
    /** Paise per unit, before any dish discount. */
    rate: number;
    /** rate × quantity, before any dish discount. */
    gross: number;
    /** Dish discount in paise (0 when none). */
    lineDiscount: number;
    amount: number;
  }[];
  /** Optional B2B customer, set from the Settle panel. */
  customer: { name: string | null; gstin: string | null };
  grossSubtotal: number;
  itemDiscount: number;
  billDiscount: number;
  discountReason: string | null;
  packaging: number;
  taxable: number;
  /** Sales with no GST (No-GST dishes). */
  exempt: number;
  cgst: number;
  sgst: number;
  taxBreakup: {
    ratePercent: string;
    cgstPercent: string;
    sgstPercent: string;
    taxable: number;
    cgst: number;
    sgst: number;
  }[];
  roundOff: number;
  total: number;
  payments: { mode: PaymentMode; amount: number }[];
  paid: number;
  due: number;
}

/** The heading printed on a bill: only a GST-registered outlet may call it a Tax Invoice. */
export function billTitle(scheme: TaxScheme): 'Tax Invoice' | 'Bill of Supply' | 'Bill' {
  if (scheme === 'REGULAR') return 'Tax Invoice';
  if (scheme === 'COMPOSITION') return 'Bill of Supply';
  return 'Bill';
}

const COMPOSITION_DECLARATION =
  'Composition taxable person, not eligible to collect tax on supplies';
const RESTAURANT_SAC = 'SAC 996331';

const MODE_LABEL: Record<PaymentMode, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' };

/** An unpaid bill, the switch on (the default) and a UPI ID set: the bill carries a UPI QR. */
export function upiQrWanted(p: BillPrintPayload): boolean {
  return (
    p.status === 'OPEN' && (p.due ?? 0) > 0 && p.outlet.printUpiQr !== false && !!p.outlet.upiVpa
  );
}

const upiNote = (p: BillPrintPayload) => `Bill ${p.billNo}`;

/**
 * The ticket with its UPI QR drawn when the bill needs one. The QR library loads only then, so
 * paid bills and outlets without a UPI ID never pay for it.
 */
export async function renderBillTicketWithQr(p: BillPrintPayload): Promise<string> {
  if (!upiQrWanted(p)) return renderBillTicket(p);
  try {
    const link = upiLink({
      vpa: p.outlet.upiVpa!,
      payee: p.outlet.upiPayee || p.outlet.name,
      amountPaise: p.due,
      note: upiNote(p),
    });
    return renderBillTicket(p, await qrSvg(link));
  } catch {
    // A bill without the QR is better than a bill that does not print.
    return renderBillTicket(p);
  }
}

const row = (label: string, amount: string, strong = false) =>
  `<div class="row${strong ? ' strong' : ''}"><span>${label}</span><span>${amount}</span></div>`;

/** A self-contained HTML page for one customer bill on a 58 or 80 mm roll. */
/** The print frame is a separate document: give it a full address for server-stored images. */
const absolute = (url: string) => new URL(url, window.location.origin).toString();

/** `upiQr` is the QR picture (SVG markup) made by the web; it prints only when the bill needs it. */
export function renderBillTicket(p: BillPrintPayload, upiQr?: string): string {
  const e = escapeHtml;
  // Jobs queued before an upgrade may lack newer fields: tolerate them rather than stall printing.
  const legacyTitle = (p as { title?: string }).title;
  // A legacy "Bill of Supply" is ambiguous (composition and pre-upgrade NONE outlets both used it),
  // so it keeps its printed heading but never gets the composition declaration.
  const scheme: TaxScheme = p.taxScheme ?? (legacyTitle === 'Tax Invoice' ? 'REGULAR' : 'NONE');
  const customer = p.customer ?? { name: null, gstin: null };
  const money = (paise: number) => e(formatPaise(paise));
  const when = new Date(p.createdAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: PRINT_TIME_ZONE,
  });
  const where = p.tableName ? `Table ${e(p.tableName)}` : `Parcel #${p.tokenNo ?? '?'}`;
  const outlet = [
    p.outlet.address && `<div class="center">${e(p.outlet.address)}</div>`,
    p.outlet.phone && `<div class="center">Ph: ${e(p.outlet.phone)}</div>`,
    scheme !== 'NONE' && p.outlet.gstin && `<div class="center">GSTIN: ${e(p.outlet.gstin)}</div>`,
    p.outlet.fssaiNumber && `<div class="center">FSSAI: ${e(p.outlet.fssaiNumber)}</div>`,
    p.outlet.billHeader && `<div class="center">${e(p.outlet.billHeader)}</div>`,
  ]
    .filter(Boolean)
    .join('');
  const lines = p.lines
    .map((l) => {
      const name = l.variantName === 'Regular' ? l.itemName : `${l.itemName} (${l.variantName})`;
      const addons = l.addons.map((a) => `<div class="sub">+ ${e(a)}</div>`).join('');
      const rate = l.rate ?? l.unitPrice;
      const gross = l.gross ?? rate * l.quantity;
      const lineDiscount = l.lineDiscount ?? 0;
      const rateLine = `<div class="sub">${l.quantity} × ${money(rate)} = ${money(gross)}</div>`;
      const discountLine =
        lineDiscount > 0 ? `<div class="sub">Discount −${money(lineDiscount)}</div>` : '';
      return `<div class="line"><div>${e(name)}</div>${addons}${rateLine}${discountLine}</div>`;
    })
    .join('');
  const totals = [
    // Dish discounts are already shown on their lines, so the subtotal is net of them.
    row('Subtotal', money(p.grossSubtotal - p.itemDiscount)),
    p.billDiscount > 0 &&
      row(
        p.discountReason ? `Discount (${e(p.discountReason)})` : 'Discount',
        `-${money(p.billDiscount)}`,
      ),
    p.packaging > 0 && row('Packaging', money(p.packaging)),
    scheme === 'REGULAR' && row('Taxable', money(p.taxable)),
    p.exempt > 0 && row('No GST items', money(p.exempt)),
    ...p.taxBreakup.flatMap((t) => [
      row(`CGST ${e(t.cgstPercent)} on ${money(t.taxable)}`, money(t.cgst)),
      row(`SGST ${e(t.sgstPercent)} on ${money(t.taxable)}`, money(t.sgst)),
    ]),
    p.roundOff !== 0 && row('Round off', money(p.roundOff)),
  ]
    .filter(Boolean)
    .join('');
  const billTo =
    customer.name || customer.gstin
      ? `<div>Bill to: ${[customer.name && e(customer.name), customer.gstin && `GSTIN ${e(customer.gstin)}`].filter(Boolean).join(' · ')}</div>`
      : '';
  const payments = p.payments.map((pay) => row(MODE_LABEL[pay.mode], money(pay.amount))).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${p.billNo}</title><style>
@page { size: ${p.paperWidthMm}mm auto; margin: 2mm; }
body { width: ${p.paperWidthMm - 4}mm; margin: 0; font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #000; }
.center { text-align: center; }
.name { font-size: 16px; font-weight: 700; }
.title { font-weight: 700; margin-top: 4px; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.strong { font-size: 16px; font-weight: 700; }
.sub { padding-left: 14px; }
.line { margin-bottom: 2px; }
.reprint { font-size: 14px; font-weight: 700; border: 2px dashed #000; text-align: center; margin: 4px 0; padding: 2px; }
.void { font-size: 22px; font-weight: 700; border: 3px solid #000; text-align: center; margin: 4px 0; }
hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
svg.upi-qr { display: block; margin: 2px auto; width: ${Math.min(40, p.paperWidthMm - 14)}mm; height: ${Math.min(40, p.paperWidthMm - 14)}mm; }
.logo { display: block; margin: 0 auto 4px; max-height: 18mm; max-width: 60%; filter: grayscale(1); }
</style></head><body>
${(p.copy ?? 0) >= 1 ? `<div class="reprint">REPRINT #${p.copy}</div>` : ''}
${p.status === 'VOID' ? '<div class="void">VOID</div>' : ''}
${p.outlet.logoUrl ? `<img class="logo" src="${e(absolute(p.outlet.logoUrl))}" alt="">` : ''}
<div class="center name">${e(p.outlet.name)}</div>
${outlet}
<div class="center title">${e(p.taxScheme ? billTitle(p.taxScheme) : (legacyTitle ?? billTitle(scheme)))}</div>
<hr>
${row(`Bill No: ${e(p.financialYear)}/${p.billNo}`, e(when))}
${row(where, p.guests ? `Guests: ${p.guests}` : '')}
${row(`Cashier: ${e(p.cashierName)}`, p.waiterName ? `Steward: ${e(p.waiterName)}` : '')}
${p.customerName ? `<div>${e(p.customerName)}</div>` : ''}
${billTo}
<hr>
${lines}
<hr>
${totals}
<hr>
${row('TOTAL', money(p.total), true)}
${payments ? `<hr>${payments}` : ''}
${p.due > 0 ? row('Due', money(p.due), true) : ''}
${upiQr && upiQrWanted(p) ? `<hr><div class="center">${upiQr.replace('<svg', '<svg class="upi-qr"')}<div>Scan to pay ${money(p.due)}</div></div>` : ''}
${scheme === 'REGULAR' ? `<div class="center">${RESTAURANT_SAC}</div>` : ''}
${scheme === 'COMPOSITION' ? `<div class="center">${COMPOSITION_DECLARATION}</div>` : ''}
${p.outlet.billFooter ? `<hr><div class="center">${e(p.outlet.billFooter)}</div>` : ''}
</body></html>`;
}
