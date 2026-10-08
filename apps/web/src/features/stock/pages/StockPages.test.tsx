import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { expectNoAxeViolations } from '@/test/a11y';
import { renderRoute } from '@/test/render';
import type { Purchase, StockItem } from '../types';

const ONION = '11111111-1111-4111-8111-111111111111';
const OIL = '22222222-2222-4222-8222-222222222222';

const item = (over: Partial<StockItem> = {}): StockItem => ({
  id: ONION,
  name: 'Onion',
  unit: 'kg',
  minLevelMilli: 5000,
  currentMilli: 2500,
  low: true,
  lastPurchase: { date: '2026-10-06T05:00:00Z', rate: 4000 },
  ...over,
});

const ITEMS = [
  item(),
  item({
    id: OIL,
    name: 'Oil',
    unit: 'L',
    minLevelMilli: 0,
    currentMilli: -500,
    low: false,
    lastPurchase: null,
  }),
];

const purchase = (over: Partial<Purchase> = {}): Purchase => ({
  id: 'p1',
  vendorName: 'Fresh Veg Traders',
  billRef: 'A-102',
  paidMode: 'CASH',
  total: 42000,
  note: null,
  createdAt: '2026-10-07T05:00:00Z',
  createdBy: { id: 'm', name: 'Meena' },
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  lines: [
    { id: 'l1', stockItemId: ONION, itemName: 'Onion', unit: 'kg', qtyMilli: 10500, amount: 42000 },
  ],
  ...over,
});

function asManager() {
  useSession.getState().setSession(sessionBody('MANAGER', ['stock.manage', 'expense.manage']));
}

describe('StockPage', () => {
  it('warns about low items and shows negative stock', async () => {
    asManager();
    mockApi({ 'GET /api/stock/items': () => json(ITEMS) });
    renderRoute('/stock');
    expect(await screen.findByText('1 item low on stock: Onion')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('2.5 kg')).toBeInTheDocument();
    expect(within(table).getByText('-0.5 L')).toHaveClass('text-red-700');
    expect(within(table).getByText('₹40/kg')).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('records a physical count in thousandths and shows the difference', async () => {
    asManager();
    const mock = mockApi({
      'GET /api/stock/items': () => json(ITEMS),
      [`POST /api/stock/items/${ONION}/count`]: () =>
        json({ difference: -750, item: item({ currentMilli: 1750 }) }, 201),
    });
    renderRoute('/stock');
    fireEvent.click(await screen.findByRole('button', { name: 'Count Onion' }));
    const sheet = await screen.findByRole('dialog', { name: 'Count Onion' });
    fireEvent.change(within(sheet).getByLabelText('Counted (kg)'), { target: { value: 'two' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save count' }));
    expect(within(sheet).getByText('Enter a quantity like 1.5')).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Counted (kg)'), { target: { value: '1.75' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save count' }));
    expect(await within(sheet).findByText('Difference −0.75 kg recorded.')).toBeInTheDocument();
    const sent = callsTo(mock, 'POST', `/api/stock/items/${ONION}/count`);
    expect(JSON.parse(String(sent[0]?.[1]?.body))).toEqual({ countedMilli: 1750 });
  });

  it('adjusts stock down with a reason', async () => {
    asManager();
    const mock = mockApi({
      'GET /api/stock/items': () => json(ITEMS),
      [`POST /api/stock/items/${ONION}/adjust`]: () => json(item(), 201),
    });
    renderRoute('/stock');
    fireEvent.click(await screen.findByRole('button', { name: 'Adjust Onion' }));
    const sheet = await screen.findByRole('dialog', { name: 'Adjust Onion' });
    fireEvent.change(within(sheet).getByLabelText('Quantity (kg)'), { target: { value: '0.5' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByText('Give a short reason')).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Reason'), { target: { value: 'Spoiled' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await expect
      .poll(() => callsTo(mock, 'POST', `/api/stock/items/${ONION}/adjust`).length)
      .toBe(1);
    expect(
      JSON.parse(String(callsTo(mock, 'POST', `/api/stock/items/${ONION}/adjust`)[0]?.[1]?.body)),
    ).toEqual({ qtyMilli: -500, reason: 'Spoiled' });
  });
});

describe('StockPage remove item', () => {
  it('removes an item after a confirmation', async () => {
    asManager();
    const mock = mockApi({
      'GET /api/stock/items': () => json(ITEMS),
      [`POST /api/stock/items/${ONION}/archive`]: () => json(item(), 201),
    });
    renderRoute('/stock');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Onion' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit Onion' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Remove this item' }));
    expect(callsTo(mock, 'POST', `/api/stock/items/${ONION}/archive`)).toHaveLength(0);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Yes, remove Onion' }));
    await expect
      .poll(() => callsTo(mock, 'POST', `/api/stock/items/${ONION}/archive`).length)
      .toBe(1);
  });
});

describe('StockPage zero count', () => {
  it('accepts "0.000" when the item ran out', async () => {
    asManager();
    const mock = mockApi({
      'GET /api/stock/items': () => json(ITEMS),
      [`POST /api/stock/items/${ONION}/count`]: () =>
        json({ difference: -2500, item: item({ currentMilli: 0 }) }, 201),
    });
    renderRoute('/stock');
    fireEvent.click(await screen.findByRole('button', { name: 'Count Onion' }));
    const sheet = await screen.findByRole('dialog', { name: 'Count Onion' });
    fireEvent.change(within(sheet).getByLabelText('Counted (kg)'), { target: { value: '0.000' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save count' }));
    expect(await within(sheet).findByText('Difference −2.5 kg recorded.')).toBeInTheDocument();
    const sent = callsTo(mock, 'POST', `/api/stock/items/${ONION}/count`);
    expect(JSON.parse(String(sent[0]?.[1]?.body))).toEqual({ countedMilli: 0 });
  });
});

describe('PurchasesPage', () => {
  async function fillPurchase() {
    fireEvent.click(await screen.findByRole('button', { name: 'New purchase' }));
    const form = await screen.findByRole('form', { name: 'New purchase' });
    await within(form).findByRole('option', { name: 'Onion' });
    fireEvent.change(within(form).getByLabelText('Vendor'), {
      target: { value: 'Fresh Veg Traders' },
    });
    fireEvent.change(within(form).getByLabelText('Item'), { target: { value: ONION } });
    fireEvent.change(within(form).getByLabelText('Quantity (kg)'), { target: { value: '10.5' } });
    fireEvent.change(within(form).getByLabelText('Amount (₹)'), { target: { value: '420' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add line' }));
    const line2 = within(form).getByRole('group', { name: 'Line 2' });
    fireEvent.change(within(line2).getByLabelText('Item'), { target: { value: OIL } });
    fireEvent.change(within(line2).getByLabelText('Quantity (L)'), { target: { value: '5' } });
    fireEvent.change(within(line2).getByLabelText('Amount (₹)'), { target: { value: '750.50' } });
    return form;
  }

  it('sends lines in thousandths and paise, keeping the request id after a failure', async () => {
    asManager();
    let attempt = 0;
    const mock = mockApi({
      'GET /api/stock/items': () => json(ITEMS),
      'GET /api/purchases': () => json([]),
      'POST /api/purchases': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return json(purchase(), 201);
      },
    });
    renderRoute('/stock/purchases');
    const form = await fillPurchase();
    expect(within(form).getByText('Total ₹1,170.50')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Save purchase' }));
    expect(await within(form).findByRole('alert')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Save purchase' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/purchases').length).toBe(2);
    const sent = callsTo(mock, 'POST', '/api/purchases');
    const key = (i: number) => new Headers(sent[i]?.[1]?.headers).get('Idempotency-Key');
    expect(key(0)).toBe(key(1));
    expect(JSON.parse(String(sent[1]?.[1]?.body))).toEqual({
      vendorName: 'Fresh Veg Traders',
      paidMode: 'CASH',
      lines: [
        { stockItemId: ONION, qtyMilli: 10500, amount: 42000 },
        { stockItemId: OIL, qtyMilli: 5000, amount: 75050 },
      ],
    });
    await expect.poll(() => screen.queryByRole('form', { name: 'New purchase' })).toBeNull();
  });

  it('explains a bad quantity before sending', async () => {
    asManager();
    const mock = mockApi({
      'GET /api/stock/items': () => json(ITEMS),
      'GET /api/purchases': () => json([]),
    });
    renderRoute('/stock/purchases');
    const form = await fillPurchase();
    fireEvent.change(within(form).getByLabelText('Quantity (kg)'), { target: { value: '1.2345' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save purchase' }));
    expect(await within(form).findByText('Line 1: enter a quantity like 1.5')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/purchases')).toHaveLength(0);
  });

  it('lists today and voids a purchase with a reason', async () => {
    asManager();
    const mock = mockApi({
      'GET /api/stock/items': () => json(ITEMS),
      'GET /api/purchases': () =>
        json([
          purchase(),
          purchase({ id: 'p2', vendorName: 'Oil Co', voidedAt: 'x', voidReason: 'Returned' }),
        ]),
      'POST /api/purchases/p1/void': () => json(purchase({ voidedAt: 'x' }), 201),
    });
    renderRoute('/stock/purchases');
    expect(await screen.findAllByText('Onion · 10.5 kg · ₹420')).toHaveLength(2);
    expect(screen.getByText('Voided: Returned')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Void purchase from Fresh Veg Traders' }));
    const confirm = screen.getByRole('button', { name: 'Void purchase' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Why void this purchase?'), {
      target: { value: 'Returned to vendor' },
    });
    fireEvent.click(confirm);
    await expect.poll(() => callsTo(mock, 'POST', '/api/purchases/p1/void').length).toBe(1);
  });
});
