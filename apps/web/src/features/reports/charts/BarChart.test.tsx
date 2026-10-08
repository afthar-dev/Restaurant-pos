import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { BarChart, type Bar } from './BarChart';

const BARS: Bar[] = [
  { key: 'a', label: '1pm', value: 840_000, detail: '1pm–2pm · ₹8,400 · 14 bills' },
  { key: 'b', label: '', value: 0, detail: '2pm–3pm · ₹0 · 0 bills' },
  { key: 'c', label: '', value: 150_000, detail: '3pm–4pm · ₹1,500 · 3 bills' },
];

const renderChart = () =>
  // Inside <main> as on every screen, so the landmark rule sees it where it lives.
  render(
    <main>
      <BarChart title="Busiest hours" takeaway="Busiest: 1pm–2pm" bars={BARS} />
    </main>,
  );

describe('BarChart', () => {
  it('names the chart and every bar', () => {
    renderChart();
    expect(screen.getByRole('heading', { level: 3, name: 'Busiest hours' })).toBeInTheDocument();
    expect(screen.getByText('Busiest: 1pm–2pm')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Busiest hours. Busiest: 1pm–2pm' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('is one tab stop and moves between bars with the arrow keys', () => {
    renderChart();
    const [first, second] = screen.getAllByRole('img');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(second!, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
  });

  it('shows the tooltip on focus and hover, and hides it on Escape', () => {
    renderChart();
    const [first, , third] = screen.getAllByRole('img');
    fireEvent.focus(first!);
    expect(screen.getByText('1pm–2pm · ₹8,400 · 14 bills')).toBeInTheDocument();
    fireEvent.keyDown(first!, { key: 'Escape' });
    expect(screen.queryByText('1pm–2pm · ₹8,400 · 14 bills')).toBeNull();
    fireEvent.mouseEnter(third!);
    expect(screen.getByText('3pm–4pm · ₹1,500 · 3 bills')).toBeInTheDocument();
    fireEvent.mouseLeave(third!);
    expect(screen.queryByText('3pm–4pm · ₹1,500 · 3 bills')).toBeNull();
  });

  it('scales bars to a round axis top and labels the axis', () => {
    renderChart();
    // Highest ₹8,400 → axis top ₹10k.
    expect(screen.getByText('₹10k')).toBeInTheDocument();
    const fills = document.querySelectorAll('[data-bar-fill]');
    expect((fills[0] as HTMLElement).style.height).toBe('84%');
    expect((fills[1] as HTMLElement).style.height).toBe('0%');
  });

  it('has no accessibility problems', async () => {
    renderChart();
    await expectNoAxeViolations();
  });
});
