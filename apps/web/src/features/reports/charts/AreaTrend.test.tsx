import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { AreaTrend } from './AreaTrend';
import type { ChartPoint } from './types';

const POINTS: ChartPoint[] = [
  { key: '13', label: '1pm', value: 840_000, detail: '1pm–2pm · ₹8,400 · 14 bills' },
  { key: '14', label: '', value: 0, detail: '2pm–3pm · ₹0 · 0 bills' },
  { key: '15', label: '3pm', value: 150_000, detail: '3pm–4pm · ₹1,500 · 3 bills' },
];

describe('AreaTrend', () => {
  it('draws the line with the peak marked and round ticks', () => {
    render(
      <main>
        <AreaTrend title="Busiest hours" points={POINTS} />
      </main>,
    );
    expect(document.querySelector('.recharts-area-curve')).not.toBeNull();
    expect(document.querySelectorAll('.recharts-reference-dot')).toHaveLength(1);
    expect(screen.getByText('₹10k')).toBeInTheDocument();
    // Only labelled hours get a tick.
    expect(screen.getByText('1pm')).toBeInTheDocument();
    expect(screen.getByText('3pm')).toBeInTheDocument();
    expect(document.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveLength(
      2,
    );
    expect(screen.getByRole('list', { name: 'Busiest hours data' })).toHaveTextContent(
      '2pm–3pm · ₹0 · 0 bills',
    );
  });

  it('still marks a peak whose axis label is thinned out', () => {
    const thinnedPeak = POINTS.map((p) => (p.key === '14' ? { ...p, value: 900_000 } : p));
    render(<AreaTrend title="Busiest hours" points={thinnedPeak} />);
    expect(document.querySelectorAll('.recharts-reference-dot')).toHaveLength(1);
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <AreaTrend title="Busiest hours" points={POINTS} />
      </main>,
    );
    await expectNoAxeViolations();
  });
});
