import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { ColumnChart } from './ColumnChart';
import type { ChartPoint } from './types';

const POINTS: ChartPoint[] = [
  { key: 'a', label: 'Fri 2', value: 1_601_400, detail: 'Fri 2 Oct · ₹16,014 · 22 bills' },
  { key: 'b', label: 'Sat 3', value: 0, detail: 'Sat 3 Oct · ₹0 · 0 bills' },
  {
    key: 'c',
    label: 'Sun 4',
    value: 2_654_600,
    detail: 'Sun 4 Oct · ₹26,546 · 35 bills',
    highlight: true,
  },
];

const fills = () =>
  [...document.querySelectorAll('.recharts-bar-rectangle path')].map((p) => p.getAttribute('fill'));

describe('ColumnChart', () => {
  it('draws a bar per point on round ticks, with the data for screen readers', () => {
    render(
      <main>
        <ColumnChart title="Sales by day" points={POINTS} />
      </main>,
    );
    // The ₹0 day draws no bar; it is still in the screen-reader list.
    expect(document.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2);
    for (const tick of ['₹0', '₹10k', '₹20k', '₹30k'])
      expect(screen.getByText(tick)).toBeInTheDocument();
    expect(screen.queryByText('₹33.3k')).toBeNull();
    const data = screen.getByRole('list', { name: 'Sales by day data' });
    expect(data).toHaveTextContent('Sat 3 Oct · ₹0 · 0 bills');
  });

  it('marks the highlighted bar darker', () => {
    render(<ColumnChart title="Sales by day" points={POINTS} />);
    expect(fills()).toContain('var(--color-primary-900)');
    expect(fills().filter((f) => f === 'var(--color-primary-900)')).toHaveLength(1);
  });

  it('drops the axes when compact', () => {
    render(<ColumnChart title="Last 7 days" points={POINTS} compact height={96} />);
    expect(screen.queryByText('₹10k')).toBeNull();
    // The ₹0 day draws no bar; it is still in the screen-reader list.
    expect(document.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2);
  });

  it('announces the bar the arrow keys move to', async () => {
    render(<ColumnChart title="Sales by day" points={POINTS} />);
    const chart = document.querySelector('svg.recharts-surface') as SVGElement;
    chart.focus();
    fireEvent.focus(chart);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Fri 2 Oct'));
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sat 3 Oct'));
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <ColumnChart title="Sales by day" points={POINTS} />
      </main>,
    );
    await expectNoAxeViolations();
  });
});
