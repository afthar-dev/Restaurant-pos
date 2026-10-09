import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartData } from './ChartData';
import { ChartTooltip } from './ChartTooltip';

const point = {
  key: 'a',
  label: 'Sun 4',
  value: 2_654_600,
  detail: 'Sun 4 Oct · ₹26,546 · 35 bills',
};

describe('ChartTooltip', () => {
  it('shows the point name over its figures', () => {
    render(<ChartTooltip active payload={[{ payload: point }]} />);
    expect(screen.getByText('Sun 4 Oct')).toHaveClass('font-semibold');
    expect(screen.getByText('₹26,546 · 35 bills')).toHaveClass('tabular-nums');
  });

  it('stays an empty live region when inactive', () => {
    render(<ChartTooltip active={false} payload={[{ payload: point }]} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('ChartData', () => {
  it('lists every point for screen readers', () => {
    render(<ChartData title="Sales by day" points={[point]} />);
    const list = screen.getByRole('list', { name: 'Sales by day data' });
    expect(list).toHaveClass('sr-only');
    expect(list).toHaveTextContent('Sun 4 Oct · ₹26,546 · 35 bills');
  });
});
