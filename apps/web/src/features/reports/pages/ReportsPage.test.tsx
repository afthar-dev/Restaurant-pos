import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';
import type { SalesReport } from '../types';

const REPORT: SalesReport = {
  range: { from: '2026-10-07', to: '2026-10-07' },
  days: [
    {
      dayId: 'd1',
      date: '2026-10-07',
      status: 'OPEN',
      bills: 3,
      total: 117050,
      cash: 3200,
      upi: 37800,
      card: 76050,
      expenses: 1000,
    },
  ],
  summary: {
    bills: 3,
    grossSubtotal: 117050,
    discounts: 0,
    packaging: 0,
    taxable: 111476,
    cgst: 2787,
    sgst: 2787,
    roundOff: 0,
    total: 117050,
    averageBill: 39017,
    payments: { CASH: 3200, UPI: 37800, CARD: 76050 },
    byType: { DINE_IN: { orders: 2, total: 41000 }, PARCEL: { orders: 1, total: 76050 } },
    expenses: { total: 1000, byCategory: [{ name: 'Gas', amount: 1000 }] },
    net: 116050,
  },
  items: [
    { itemName: '=Paneer Tikka', variantName: 'Half', quantity: 2, amount: 36000 },
    { itemName: 'Tandoori Roti', variantName: 'Regular', quantity: 4, amount: 12800 },
  ],
  categories: [{ name: 'Starters', quantity: 2, amount: 36000 }],
};

/** jsdom's Blob has no text(); FileReader works. */
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

function asOwner() {
  useSession.getState().setSession(sessionBody('OWNER', ['reports.all']));
}

afterEach(() => vi.restoreAllMocks());

describe('ReportsPage', () => {
  it('shows today by default with the summary, days and dishes', async () => {
    asOwner();
    const mock = mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    renderRoute('/reports');
    expect(await screen.findByText('₹1170.50', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('₹1160.50')).toBeInTheDocument();
    const url = String(callsTo(mock, 'GET', '/api/reports/sales')[0]?.[0]);
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
    const dishes = screen.getByRole('table', { name: 'Dishes sold' });
    expect(within(dishes).getByText('=Paneer Tikka (Half)')).toBeInTheDocument();
    expect(within(dishes).getByText('Tandoori Roti')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search dishes'), { target: { value: 'roti' } });
    expect(within(dishes).queryByText('=Paneer Tikka (Half)')).toBeNull();
  });

  it('asks for another range with a custom from-to', async () => {
    asOwner();
    const mock = mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    renderRoute('/reports');
    await screen.findByRole('table', { name: 'Days' });
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-30' } });
    await expect
      .poll(() =>
        callsTo(mock, 'GET', '/api/reports/sales').some(([u]) =>
          String(u).includes('from=2026-09-01&to=2026-09-30'),
        ),
      )
      .toBe(true);
  });

  it('downloads days and dishes as CSV with formulas made harmless', async () => {
    asOwner();
    mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    const blobs: Blob[] = [];
    // jsdom has no object URLs.
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:report';
      },
      revokeObjectURL: () => undefined,
    });
    const clicks = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderRoute('/reports');
    await screen.findByRole('table', { name: 'Days' });
    fireEvent.click(screen.getByRole('button', { name: 'Days CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dishes CSV' }));
    expect(clicks).toHaveBeenCalledTimes(2);
    const [days, items] = await Promise.all(blobs.map(readBlob));
    expect(days).toContain('"2026-10-07",3,1170.5,32,378,760.5,10');
    expect(items).toContain(`"'=Paneer Tikka","Half",2,360`);
  });

  it('shows the server message for a range it refuses', async () => {
    asOwner();
    mockApi({
      'GET /api/reports/sales': () =>
        json({ code: 'VALIDATION', message: 'Choose at most 92 days' }, 400),
    });
    renderRoute('/reports');
    expect(await screen.findByText('Choose at most 92 days')).toBeInTheDocument();
  });

  it('is only for the owner', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', ['reports.dayClose']));
    mockApi({});
    renderRoute('/reports');
    expect(await screen.findByText('You do not have access to this screen.')).toBeInTheDocument();
  });
});
