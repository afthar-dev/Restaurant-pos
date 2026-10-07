import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { printBill } from '@/features/billing/printBill';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import { renderBillTicket, type BillPrintPayload } from './billTicket';
import { PrintWorker } from '../PrintWorker';

export const billPayload: BillPrintPayload = {
  kind: 'BILL',
  title: 'Tax Invoice',
  outlet: {
    name: 'Spice Garden',
    address: 'MG Road, Bengaluru',
    phone: '080 1234 5678',
    gstin: '29ABCDE1234F1Z5',
    fssaiNumber: '12345678901234',
    billHeader: 'Pure veg',
    billFooter: 'Thank you, visit again',
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
      amount: 42000,
    },
    {
      itemName: 'Tandoori Roti',
      variantName: 'Regular',
      addons: [],
      quantity: 1,
      unitPrice: 3000,
      amount: 3000,
    },
  ],
  grossSubtotal: 45000,
  itemDiscount: 0,
  billDiscount: 4500,
  discountReason: 'Regular guest',
  packaging: 0,
  taxable: 40500,
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
      '2 × Paneer &lt;b&gt;Tikka&lt;/b&gt; (Half)',
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

  it('prints a bill of supply without tax lines, a parcel token and a void stamp', () => {
    const html = renderBillTicket({
      ...billPayload,
      title: 'Bill of Supply',
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
});
