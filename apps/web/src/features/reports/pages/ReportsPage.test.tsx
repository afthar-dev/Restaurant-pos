import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
      collected: 117050,
      unpaid: 0,
      expenses: 1000,
    },
  ],
  summary: {
    bills: 3,
    grossSubtotal: 117050,
    discounts: 0,
    packaging: 0,
    taxable: 111476,
    collected: 117050,
    unpaid: 0,
    exempt: 0,
    gstBreakup: [{ ratePercent: 5, taxable: 111476, cgst: 2787, sgst: 2787 }],
    cgst: 2787,
    sgst: 2787,
    roundOff: 0,
    total: 117050,
    averageOrder: 39017,
    payments: { CASH: 3200, UPI: 37800, CARD: 76050 },
    byType: { DINE_IN: { orders: 2, total: 41000 }, PARCEL: { orders: 1, total: 76050 } },
    expenses: { total: 1000, byCategory: [{ name: 'Gas', amount: 1000 }] },
    net: 116050,
  },
  composition: null,
  items: [
    { itemName: '=Paneer Tikka', variantName: 'Half', quantity: 2, amount: 36000 },
    { itemName: 'Tandoori Roti', variantName: 'Regular', quantity: 4, amount: 12800 },
  ],
  categories: [{ name: 'Starters', quantity: 2, amount: 36000 }],
  hours: [{ hour: 13, bills: 2, total: 37800 }],
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
  // The route loads this page (and its chart library) lazily; load it once up front so a busy
  // test run does not spend the first test's wait on compiling it.
  beforeAll(async () => {
    await import('./ReportsPage');
    await import('../charts/ColumnChart');
  }, 60_000);

  it('shows today by default with the summary, days and dishes', async () => {
    asOwner();
    const mock = mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    renderRoute('/reports');
    expect(
      // The page and its chart library load lazily; give the first render time on a busy machine.
      (await screen.findAllByText('₹1,170.50', { selector: 'dd' }, { timeout: 15_000 }))[0],
    ).toBeInTheDocument();
    expect(screen.getByText('₹1,160.50')).toBeInTheDocument();
    const url = String(callsTo(mock, 'GET', '/api/reports/sales')[0]?.[0]);
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
    const dishes = screen.getByRole('table', { name: 'Dishes sold' });
    expect(within(dishes).getByText('=Paneer Tikka (Half)')).toBeInTheDocument();
    expect(within(dishes).getByText('Tandoori Roti')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search dishes'), { target: { value: 'roti' } });
    expect(within(dishes).queryByText('=Paneer Tikka (Half)')).toBeNull();
  });

  it('shows collected beside sales, and unpaid only when something is unpaid', async () => {
    asOwner();
    mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    renderRoute('/reports');
    const totals = await screen.findByRole('group', { name: 'Totals' }, { timeout: 15_000 });
    expect(within(totals).getByText('Collected')).toBeInTheDocument();
    expect(within(totals).queryByText('Unpaid')).toBeNull();
  });

  it('shows unpaid bills as their own figure and a days column', async () => {
    asOwner();
    const summary = { ...REPORT.summary, collected: 100000, unpaid: 17050 };
    const day = { ...REPORT.days[0]!, collected: 100000, unpaid: 17050 };
    mockApi({ 'GET /api/reports/sales': () => json({ ...REPORT, summary, days: [day] }) });
    renderRoute('/reports');
    const totals = await screen.findByRole('group', { name: 'Totals' }, { timeout: 15_000 });
    expect(within(totals).getByText('Unpaid')).toBeInTheDocument();
    expect(within(totals).getByText('₹170.50')).toBeInTheDocument();
    const days = screen.getByRole('table', { name: 'Days' });
    expect(within(days).getByRole('columnheader', { name: 'Unpaid' })).toBeInTheDocument();
  });

  it('calls sales minus GST and expenses "After expenses", not profit or net', async () => {
    asOwner();
    mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    renderRoute('/reports');
    const totals = await screen.findByRole('group', { name: 'Totals' }, { timeout: 15_000 });
    expect(within(totals).getByText('After expenses')).toBeInTheDocument();
    expect(within(totals).getByText('Sales without GST, minus expenses')).toBeInTheDocument();
    expect(within(totals).queryByText('Net')).toBeNull();
  });

  it('averages per order, not per bill', async () => {
    asOwner();
    mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    renderRoute('/reports');
    const totals = await screen.findByRole('group', { name: 'Totals' }, { timeout: 15_000 });
    expect(within(totals).getByText('Average order')).toBeInTheDocument();
    expect(within(totals).queryByText('Average bill')).toBeNull();
  });

  it('breaks GST down by rate and shows No-GST sales as their own row', async () => {
    asOwner();
    const summary = {
      ...REPORT.summary,
      taxable: 30000,
      exempt: 3000,
      gstBreakup: [
        { ratePercent: 5, taxable: 12000, cgst: 300, sgst: 300 },
        { ratePercent: 18, taxable: 18000, cgst: 1620, sgst: 1620 },
      ],
    };
    mockApi({ 'GET /api/reports/sales': () => json({ ...REPORT, summary }) });
    renderRoute('/reports');
    const gst = await screen.findByRole('table', { name: 'GST by rate' }, { timeout: 15_000 });
    expect(within(gst).getByRole('row', { name: /5%.*₹120.*₹3.*₹3/ })).toBeInTheDocument();
    expect(within(gst).getByRole('row', { name: /18%.*₹180.*₹16.20.*₹16.20/ })).toBeInTheDocument();
    expect(within(gst).getByRole('row', { name: /No GST sales.*₹30/ })).toBeInTheDocument();
  });

  it('shows turnover and tax payable instead of the GST table for a composition outlet', async () => {
    asOwner();
    const composition = { turnover: 117050, taxPayable: 5853 };
    mockApi({
      'GET /api/reports/sales': () =>
        json({
          ...REPORT,
          composition,
          summary: { ...REPORT.summary, gstBreakup: [], cgst: 0, sgst: 0 },
        }),
    });
    renderRoute('/reports');
    const strip = await screen.findByRole('group', { name: 'Composition' }, { timeout: 15_000 });
    expect(within(strip).getByText('Turnover (composition)')).toBeInTheDocument();
    expect(within(strip).getByText('₹1,170.50')).toBeInTheDocument();
    expect(within(strip).getByText('Composition tax payable (5%)')).toBeInTheDocument();
    expect(within(strip).getByText('₹58.53')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'GST by rate' })).toBeNull();
  });

  it('leaves the composition figures out for a regular outlet', async () => {
    asOwner();
    mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    renderRoute('/reports');
    await screen.findByRole('table', { name: 'GST by rate' }, { timeout: 15_000 });
    expect(screen.queryByText('Turnover (composition)')).toBeNull();
  });

  it('leaves the No-GST row out when everything carried GST', async () => {
    asOwner();
    mockApi({ 'GET /api/reports/sales': () => json(REPORT) });
    renderRoute('/reports');
    const gst = await screen.findByRole('table', { name: 'GST by rate' }, { timeout: 15_000 });
    expect(within(gst).queryByText('No GST sales')).toBeNull();
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
