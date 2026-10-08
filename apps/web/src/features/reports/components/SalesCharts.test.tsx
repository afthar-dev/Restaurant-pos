import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import type { SalesReport } from '../types';
import { SalesCharts } from './SalesCharts';

const SUMMARY: SalesReport['summary'] = {
  bills: 17,
  grossSubtotal: 0,
  discounts: 0,
  packaging: 0,
  taxable: 0,
  cgst: 0,
  sgst: 0,
  roundOff: 0,
  total: 2_825_000,
  averageBill: 0,
  payments: { CASH: 500_000, UPI: 1_000_000, CARD: 0 },
  byType: { DINE_IN: { orders: 0, total: 0 }, PARCEL: { orders: 0, total: 0 } },
  expenses: { total: 0, byCategory: [] },
  net: 0,
};

const day = (dayId: string, date: string, total: number, bills: number) => ({
  dayId,
  date,
  status: 'CLOSED' as const,
  bills,
  total,
  cash: 0,
  upi: 0,
  card: 0,
  expenses: 0,
});

const REPORT: SalesReport = {
  range: { from: '2026-10-09', to: '2026-10-10' },
  days: [day('d1', '2026-10-09', 1_000_000, 7), day('d2', '2026-10-10', 1_825_000, 10)],
  summary: SUMMARY,
  items: [
    { itemName: 'Paneer Tikka', variantName: 'Regular', quantity: 20, amount: 440_000 },
    { itemName: 'Biryani', variantName: 'Half', quantity: 5, amount: 150_000 },
  ],
  categories: [],
  hours: [
    { hour: 13, bills: 14, total: 840_000 },
    { hour: 15, bills: 3, total: 150_000 },
  ],
};

describe('SalesCharts', () => {
  it('shows the four charts with a takeaway each', () => {
    render(<SalesCharts report={REPORT} />);
    expect(screen.getByRole('heading', { level: 2, name: 'At a glance' })).toBeInTheDocument();
    expect(screen.getByText('Best day: Sat 10 Oct, ₹18,250')).toBeInTheDocument();
    expect(screen.getByText('Busiest: 1pm–2pm, ₹8,400 from 14 bills')).toBeInTheDocument();
    expect(screen.getByText('Most paid by UPI: 67%')).toBeInTheDocument();
    expect(screen.getByText('Top seller: Paneer Tikka, ₹4,400')).toBeInTheDocument();
  });

  it('lists every service hour, quiet ones included', () => {
    render(<SalesCharts report={REPORT} />);
    const items = within(screen.getByRole('list', { name: 'Busiest hours data' })).getAllByRole(
      'listitem',
    );
    expect(items.map((li) => li.textContent)).toEqual([
      '1pm–2pm · ₹8,400 · 14 bills',
      '2pm–3pm · ₹0 · 0 bills',
      '3pm–4pm · ₹1,500 · 3 bills',
    ]);
  });

  it('lists every payment mode, skipping the empty segment', () => {
    render(<SalesCharts report={REPORT} />);
    const legend = within(screen.getByRole('list', { name: 'Payment modes' }));
    expect(legend.getByText('Card').closest('li')).toHaveTextContent('Card₹00%');
    expect(legend.getByText('Cash').closest('li')).toHaveTextContent('Cash₹5,00033%');
    expect(
      screen.getByRole('img', { name: 'Cash ₹5,000 (33%), UPI ₹10,000 (67%), Card ₹0 (0%)' })
        .children,
    ).toHaveLength(2);
  });

  it('lists every day for screen readers', () => {
    render(<SalesCharts report={REPORT} />);
    expect(screen.getByRole('list', { name: 'Sales by day data' })).toHaveTextContent(
      'Sat 10 Oct · ₹18,250 · 10 bills',
    );
  });

  it('names dishes with their size when it is not Regular', () => {
    render(<SalesCharts report={REPORT} />);
    expect(screen.getByText('Biryani (Half)')).toBeInTheDocument();
  });

  it('leaves out Sales by day for a single day, and everything without bills', () => {
    const { rerender } = render(<SalesCharts report={{ ...REPORT, days: [REPORT.days[1]!] }} />);
    expect(screen.queryByRole('heading', { name: 'Sales by day' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Busiest hours' })).toBeInTheDocument();
    rerender(
      <SalesCharts
        report={{ ...REPORT, summary: { ...SUMMARY, bills: 0 }, hours: [], items: [] }}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'At a glance' })).toBeNull();
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <SalesCharts report={REPORT} />
      </main>,
    );
    await expectNoAxeViolations();
  });
});
