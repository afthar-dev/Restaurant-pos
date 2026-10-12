import { describe, expect, it } from 'vitest';
import {
  renderBillTicket,
  renderBillTicketWithQr,
  upiQrWanted,
  type BillPrintPayload,
} from './billTicket';

const unpaid: BillPrintPayload = {
  kind: 'BILL',
  copy: 0,
  taxScheme: 'NONE',
  outlet: {
    name: 'Spice Garden',
    address: null,
    phone: null,
    gstin: null,
    fssaiNumber: null,
    billHeader: null,
    billFooter: null,
    logoUrl: null,
    upiVpa: 'spicegarden@okicici',
    upiPayee: 'Spice Garden',
    printUpiQr: true,
  },
  billNo: 135,
  financialYear: '2026-27',
  status: 'OPEN',
  createdAt: '2026-10-06T14:12:00.000Z',
  cashierName: 'Kavya',
  waiterName: null,
  orderType: 'DINE_IN',
  tableName: 'T1',
  tokenNo: null,
  customerName: null,
  customer: { name: null, gstin: null },
  guests: null,
  paperWidthMm: 80,
  lines: [],
  grossSubtotal: 24200,
  itemDiscount: 0,
  billDiscount: 0,
  discountReason: null,
  packaging: 0,
  taxable: 24200,
  exempt: 0,
  cgst: 0,
  sgst: 0,
  taxBreakup: [],
  roundOff: 0,
  total: 24200,
  payments: [],
  paid: 0,
  due: 24200,
};

const outlet = (extra: Partial<BillPrintPayload['outlet']>): BillPrintPayload => ({
  ...unpaid,
  outlet: { ...unpaid.outlet, ...extra },
});

describe('the UPI QR on a printed bill', () => {
  it('is wanted only on an unpaid bill with the setting on and a UPI ID', () => {
    expect(upiQrWanted(unpaid)).toBe(true);
    expect(upiQrWanted({ ...unpaid, status: 'PAID', due: 0 })).toBe(false);
    expect(upiQrWanted({ ...unpaid, status: 'VOID', due: 0 })).toBe(false);
    expect(upiQrWanted({ ...unpaid, due: 0 })).toBe(false);
    expect(upiQrWanted(outlet({ printUpiQr: false }))).toBe(false);
    expect(upiQrWanted(outlet({ upiVpa: null }))).toBe(false);
  });

  it('prints the picture under the total, with the amount due', () => {
    const html = renderBillTicket(unpaid, '<svg data-test="qr"></svg>');
    expect(html).toContain('data-test="qr"');
    expect(html).toContain('class="upi-qr"');
    expect(html).toContain('Scan to pay ₹242');
    expect(html.indexOf('TOTAL')).toBeLessThan(html.indexOf('Scan to pay'));
  });

  it('prints nothing extra when there is no picture or the bill is paid', () => {
    expect(renderBillTicket(unpaid)).not.toContain('Scan to pay');
    expect(renderBillTicket({ ...unpaid, status: 'PAID', due: 0 }, '<svg></svg>')).not.toContain(
      'Scan to pay',
    );
  });

  it('still prints an old payload that has no UPI fields', () => {
    const old = { ...unpaid, outlet: { ...unpaid.outlet } } as {
      outlet: Partial<BillPrintPayload['outlet']>;
    } & BillPrintPayload;
    delete old.outlet.upiVpa;
    delete old.outlet.upiPayee;
    delete old.outlet.printUpiQr;
    expect(upiQrWanted(old)).toBe(false);
    expect(renderBillTicket(old, undefined)).toContain('TOTAL');
  });

  it('draws the QR for the amount due before rendering', async () => {
    const html = await renderBillTicketWithQr({ ...unpaid, due: 10050 });
    expect(html).toContain('<svg');
    expect(html).toContain('Scan to pay ₹100.50');
    expect(await renderBillTicketWithQr({ ...unpaid, status: 'PAID', due: 0 })).not.toContain(
      '<svg',
    );
  });

  it('falls back to the restaurant name when there is no payee name', async () => {
    const html = await renderBillTicketWithQr(outlet({ upiPayee: null }));
    expect(html).toContain('<svg');
  });
});
