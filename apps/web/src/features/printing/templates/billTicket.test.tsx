import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { printBill } from '@/features/billing/printBill';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import { withDeviceTimeZone } from '@/test/timezone';
import { billTitle, renderBillTicket, type BillPrintPayload } from './billTicket';
import { PrintWorker } from '../PrintWorker';

export const billPayload: BillPrintPayload = {
  kind: 'BILL',
  copy: 0,
  taxScheme: 'REGULAR',
  outlet: {
    name: 'Spice Garden',
    address: 'MG Road, Bengaluru',
    phone: '080 1234 5678',
    gstin: '29ABCDE1234F1Z5',
    fssaiNumber: '12345678901234',
    billHeader: 'Pure veg',
    billFooter: 'Thank you, visit again',
    logoUrl: null,
  },
  billNo: 12,
  financialYear: '2026-27',
  status: 'PAID',
  createdAt: '2026-10-06T14:12:00.000Z',
  cashierName: 'Kavya',
  waiterName: 'Arun',
  orderType: 'DINE_IN',
  tableName: 'T1',
  tokenNo: null,
  customerName: null,
  guests: 2,
  paperWidthMm: 80,
  lines: [
    {
      itemName: 'Paneer <b>Tikka</b>',
      variantName: 'Half',
      addons: ['Cheese'],
      quantity: 2,
      unitPrice: 21000,
      rate: 21000,
      gross: 42000,
      lineDiscount: 0,
      amount: 42000,
    },
    {
      itemName: 'Tandoori Roti',
      variantName: 'Regular',
      addons: [],
      quantity: 1,
      unitPrice: 3000,
      rate: 3000,
      gross: 3000,
      lineDiscount: 0,
      amount: 3000,
    },
  ],
  customer: { name: null, gstin: null },
  grossSubtotal: 45000,
  itemDiscount: 0,
  billDiscount: 4500,
  discountReason: 'Regular guest',
  packaging: 0,
  taxable: 40500,
  exempt: 0,
  cgst: 1013,
  sgst: 1013,
  taxBreakup: [
    {
      ratePercent: '5%',
      cgstPercent: '2.5%',
      sgstPercent: '2.5%',
      taxable: 40500,
      cgst: 1013,
      sgst: 1013,
    },
  ],
  roundOff: -26,
  total: 42500,
  payments: [{ mode: 'CASH', amount: 42500 }],
  paid: 42500,
  due: 0,
};

describe('renderBillTicket', () => {
  it('prints a GST tax invoice with outlet details, lines, tax and total', () => {
    const html = renderBillTicket(billPayload);
    for (const text of [
      'Spice Garden',
      'GSTIN: 29ABCDE1234F1Z5',
      'FSSAI: 12345678901234',
      'Tax Invoice',
      'Bill No: 2026-27/12',
      'T1',
      'Paneer &lt;b&gt;Tikka&lt;/b&gt; (Half)',
      '2 × ₹210.00 = ₹420.00',
      '+ Cheese',
      'Discount (Regular guest)',
      'CGST 2.5%',
      'SGST 2.5%',
      'Round off',
      'TOTAL',
      '₹425.00',
      'Cash',
      'Thank you, visit again',
      '80mm',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('<b>Tikka');
    expect(html).not.toContain('VOID');
  });

  it('shows No-GST sales apart from the taxed value, only when there are any', () => {
    expect(renderBillTicket(billPayload)).not.toContain('No GST items');
    const html = renderBillTicket({ ...billPayload, exempt: 6000 });
    expect(html).toContain('No GST items');
    expect(html).toContain('₹60.00');
  });

  it('puts the logo at the top in greyscale, with an address the print frame can load', () => {
    const html = renderBillTicket({
      ...billPayload,
      outlet: { ...billPayload.outlet, logoUrl: '/api/media/abc.png' },
    });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const logo = doc.querySelector('img.logo');
    expect(logo?.getAttribute('src')).toBe(`${window.location.origin}/api/media/abc.png`);
    expect(html).toMatch(/.logo {[^}]*grayscale/);
    expect(renderBillTicket(billPayload)).not.toContain('<img');
  });

  it('prints a bill of supply without tax lines, a parcel token and a void stamp', () => {
    const html = renderBillTicket({
      ...billPayload,
      taxScheme: 'COMPOSITION',
      taxBreakup: [],
      cgst: 0,
      sgst: 0,
      orderType: 'PARCEL',
      tableName: null,
      tokenNo: 7,
      status: 'VOID',
      paperWidthMm: 58,
    });
    expect(html).toContain('Bill of Supply');
    expect(html).not.toContain('CGST');
    expect(html).toContain('Parcel #7');
    expect(html).toContain('VOID');
    expect(html).toContain('58mm');
  });
});

describe('bill line maths', () => {
  const line = (name: string, quantity: number, rate: number, lineDiscount = 0) => ({
    itemName: name,
    variantName: 'Regular',
    addons: [],
    quantity,
    unitPrice: rate,
    rate,
    gross: rate * quantity,
    lineDiscount,
    amount: rate * quantity - lineDiscount,
  });
  const money = (s: string) => Math.round(Number(s.replace(/[₹,]/g, '')) * 100);
  const textOf = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';

  it('prints qty × rate = amount, the dish discount, and numbers that add up to the subtotal', () => {
    const html = renderBillTicket({
      ...billPayload,
      taxScheme: 'NONE',
      taxBreakup: [],
      cgst: 0,
      sgst: 0,
      lines: [line('Paneer Tikka', 2, 20000, 4000), line('Naan', 1, 5000)],
      grossSubtotal: 45000,
      itemDiscount: 4000,
      billDiscount: 0,
      discountReason: null,
      roundOff: 0,
      total: 41000,
    });
    const text = textOf(html);
    expect(text).toContain('2 × ₹200.00 = ₹400.00');
    expect(text).toContain('Discount −₹40.00');
    expect(text).toContain('1 × ₹50.00 = ₹50.00');
    const beforeSubtotal = text.slice(0, text.indexOf('Subtotal'));
    const gross = [...beforeSubtotal.matchAll(/= (₹[\d,.]+)/g)].map((m) => money(m[1]!));
    const discounts = [...beforeSubtotal.matchAll(/Discount −(₹[\d,.]+)/g)].map((m) =>
      money(m[1]!),
    );
    const subtotal = money(/Subtotal\s*(₹[\d,.]+)/.exec(text)![1]!);
    expect(subtotal).toBe(41000);
    expect(gross.reduce((a, b) => a + b, 0) - discounts.reduce((a, b) => a + b, 0)).toBe(subtotal);
  });

  it('prints no line discount row when the dish has none', () => {
    const text = textOf(renderBillTicket(billPayload));
    expect(text.slice(0, text.indexOf('Subtotal'))).not.toContain('−');
  });
});

describe('bill to a customer', () => {
  it('prints Bill to with the name and GSTIN only when set', () => {
    expect(renderBillTicket(billPayload)).not.toContain('Bill to');
    const html = renderBillTicket({
      ...billPayload,
      customer: { name: 'Acme <Foods>', gstin: '27ABCDE1234F1Z5' },
    });
    expect(html).toContain('Bill to: Acme &lt;Foods&gt; · GSTIN 27ABCDE1234F1Z5');
    const gstinOnly = renderBillTicket({
      ...billPayload,
      customer: { name: null, gstin: '27ABCDE1234F1Z5' },
    });
    expect(gstinOnly).toContain('Bill to: GSTIN 27ABCDE1234F1Z5');
  });
});

describe('bill title and wording by tax scheme', () => {
  const noTax = { taxBreakup: [], cgst: 0, sgst: 0 };

  it('names the bill after the scheme', () => {
    expect(billTitle('REGULAR')).toBe('Tax Invoice');
    expect(billTitle('COMPOSITION')).toBe('Bill of Supply');
    expect(billTitle('NONE')).toBe('Bill');
  });

  it('REGULAR prints Tax Invoice, the GSTIN, CGST and SGST rows and the SAC code', () => {
    const html = renderBillTicket(billPayload);
    expect(html).toContain('Tax Invoice');
    expect(html).toContain('GSTIN: 29ABCDE1234F1Z5');
    expect(html).toContain('CGST 2.5%');
    expect(html).toContain('SGST 2.5%');
    expect(html).toContain('SAC 996331');
    expect(html).not.toContain('Composition taxable person');
  });

  it('COMPOSITION prints Bill of Supply, the GSTIN, the declaration and no tax rows', () => {
    const html = renderBillTicket({ ...billPayload, ...noTax, taxScheme: 'COMPOSITION' });
    expect(html).toContain('Bill of Supply');
    expect(html).toContain('GSTIN: 29ABCDE1234F1Z5');
    expect(html).toContain('Composition taxable person, not eligible to collect tax on supplies');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SAC 996331');
  });

  it('NONE prints Bill with no GSTIN line and no tax rows', () => {
    const html = renderBillTicket({ ...billPayload, ...noTax, taxScheme: 'NONE' });
    expect(html).toContain('>Bill<');
    expect(html).not.toContain('GSTIN');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SAC 996331');
    expect(html).not.toContain('Composition taxable person');
  });
});

describe('bill date on a PC set to UTC', () => {
  withDeviceTimeZone('UTC');

  it('prints the India date and time, not the PC date', () => {
    // 19:00 UTC on 10 Oct is 00:30 IST on 11 Oct.
    const html = renderBillTicket({ ...billPayload, createdAt: '2026-10-10T19:00:00.000Z' });
    expect(html).toMatch(/11 Oct 2026, 12:30.?am/i);
    expect(html).not.toContain('10 Oct');
  });
});

describe('bill printing', () => {
  it('prints bill jobs from the queue', async () => {
    let done = false;
    const mock = mockApi({
      'POST /api/print/jobs/claim': () =>
        json(done ? [] : [{ id: 'j9', kind: 'BILL', payload: billPayload, attempts: 0 }], 201),
      'POST /api/print/jobs/j9/done': () => {
        done = true;
        return json({ id: 'j9', status: 'PRINTED' }, 201);
      },
    });
    const printHtml = vi.fn(async (_html: string) => undefined);
    renderWithProviders(<PrintWorker printHtml={printHtml} />);
    await expect.poll(() => callsTo(mock, 'POST', '/api/print/jobs/j9/done').length).toBe(1);
    expect(printHtml.mock.calls[0]?.[0]).toContain('Tax Invoice');
    expect(
      JSON.parse(String(callsTo(mock, 'POST', '/api/print/jobs/j9/done')[0]?.[1]?.body)),
    ).toEqual({
      ok: true,
    });
  });

  it('leaves the bill to the bill printer when one is set up', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print']));
    mockApi({ 'POST /api/bills/b1/print': () => json({ id: 'b1', queued: 1 }, 201) });
    const printHtml = vi.fn(async (_html: string) => undefined);
    await expect(printBill('b1', printHtml)).resolves.toBe('queued');
    expect(printHtml).not.toHaveBeenCalled();
  });

  it('prints in this browser when no bill printer is set up', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print']));
    const mock = mockApi({
      'POST /api/bills/b1/print': () => json({ id: 'b1', queued: 0 }, 201),
      'GET /api/bills/b1/print-payload': () => json(billPayload),
    });
    const printHtml = vi.fn(async (_html: string) => undefined);
    await expect(printBill('b1', printHtml)).resolves.toBe('printed-here');
    expect(printHtml.mock.calls[0]?.[0]).toContain('Bill No: 2026-27/12');
    expect(String(callsTo(mock, 'GET', '/api/bills/b1/print-payload')[0]?.[0])).toContain(
      'paperWidthMm=80',
    );
  });

  it('prints the copy number its own tap was given, even if a later tap already raised the count', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print']));
    let taps = 0;
    mockApi({
      'POST /api/bills/b1/print': () => json({ id: 'b1', queued: 0, copy: ++taps }, 201),
      // Both taps were counted before either payload is read: the payload says the latest.
      'GET /api/bills/b1/print-payload': () => json({ ...billPayload, copy: 2 }),
    });
    const printHtml = vi.fn(async (_html: string) => undefined);
    await Promise.all([printBill('b1', printHtml), printBill('b1', printHtml)]);
    const pages = printHtml.mock.calls.map((c) => c[0]);
    expect(pages.some((h) => h.includes('REPRINT #1'))).toBe(true);
    expect(pages.some((h) => h.includes('REPRINT #2'))).toBe(true);
    expect(new Set(pages.map((h) => /REPRINT #[0-9]+/.exec(h)?.[0])).size).toBe(2);
  });
});

describe('totals block order and old queued payloads', () => {
  const textOf = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';

  it('prints Subtotal, Discount, Packaging, Taxable, GST, Round off, Total in order for REGULAR', () => {
    const text = textOf(renderBillTicket({ ...billPayload, packaging: 500 }));
    const at = ['Subtotal', 'Discount', 'Packaging', 'Taxable', 'CGST', 'Round off', 'TOTAL'].map(
      (label) => text.indexOf(label, text.indexOf('Subtotal')),
    );
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(text).toMatch(/Taxable\s*₹405\.00/);
  });

  it('has no Taxable row for NONE or COMPOSITION', () => {
    for (const taxScheme of ['NONE', 'COMPOSITION'] as const) {
      const html = renderBillTicket({
        ...billPayload,
        taxScheme,
        taxBreakup: [],
        cgst: 0,
        sgst: 0,
      });
      expect(textOf(html)).not.toContain('Taxable');
    }
  });

  it('renders a payload queued before the upgrade, with correct amounts', () => {
    const { customer: _c, taxScheme: _t, ...rest } = billPayload;
    const old = {
      ...rest,
      title: 'Bill of Supply',
      lines: billPayload.lines.map(({ rate: _r, gross: _g, lineDiscount: _d, ...l }) => l),
    } as unknown as BillPrintPayload;
    const text = textOf(renderBillTicket(old));
    expect(text).toContain('Bill of Supply');
    expect(text).toContain('2 × ₹210.00 = ₹420.00');
    expect(text).toContain('1 × ₹30.00 = ₹30.00');
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Bill to');
    // Pre-upgrade NONE outlets also said "Bill of Supply": never claim composition for them.
    expect(text).not.toContain('Composition taxable person');
  });
});

describe('reprint mark', () => {
  const textOf = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';

  it('prints REPRINT #n above the bill title for a reprint, and nothing on the original', () => {
    const text = textOf(renderBillTicket({ ...billPayload, copy: 2 }));
    expect(text).toContain('REPRINT #2');
    expect(text.indexOf('REPRINT #2')).toBeLessThan(text.indexOf('Tax Invoice'));
    expect(textOf(renderBillTicket(billPayload))).not.toContain('REPRINT');
  });

  it('treats a payload queued before the upgrade as the original', () => {
    const { copy: _c, ...rest } = billPayload;
    expect(textOf(renderBillTicket(rest as unknown as BillPrintPayload))).not.toContain('REPRINT');
  });
});
