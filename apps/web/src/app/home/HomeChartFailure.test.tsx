import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

// A tab left open across a redeploy, or flaky Wi-Fi: the chart's code fails to load.
vi.mock('@/features/reports/charts/ColumnChart', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

const EMPTY_WEEK = {
  range: { from: '2026-10-01', to: '2026-10-07' },
  days: [],
  summary: {
    bills: 0,
    grossSubtotal: 0,
    discounts: 0,
    packaging: 0,
    taxable: 0,
    collected: 0,
    unpaid: 0,
    exempt: 0,
    gstBreakup: [],
    cgst: 0,
    sgst: 0,
    roundOff: 0,
    total: 0,
    averageOrder: 0,
    payments: { CASH: 0, UPI: 0, CARD: 0 },
    byType: { DINE_IN: { orders: 0, total: 0 }, PARCEL: { orders: 0, total: 0 } },
    expenses: { total: 0, byCategory: [] },
    net: 0,
  },
  items: [],
  categories: [],
  hours: [],
};

describe('Home when the chart cannot load', () => {
  it('keeps the home screen and the card text, without the chart', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['reports.all'], 'Asha'));
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/reports/sales': () => json(EMPTY_WEEK),
    });
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 2, name: 'Last 7 days' })).toBeVisible();
    // Let the chart's import fail, then the screen must still be the home screen.
    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeNull(), {
      timeout: 4000,
    });
    expect(screen.getByRole('link', { name: 'See reports' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });
});
