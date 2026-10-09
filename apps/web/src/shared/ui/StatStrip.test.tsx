import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { StatStrip } from './StatStrip';

const ITEMS = [
  { label: 'Sales', value: '₹95,840' },
  { label: 'Bills', value: '134' },
  { label: 'Net', value: '−₹1,200', tone: 'danger' as const, hint: 'after expenses' },
];

describe('StatStrip', () => {
  it('lists figures as terms and values in one named group', async () => {
    render(
      <main>
        <StatStrip label="Totals" items={ITEMS} />
      </main>,
    );
    const strip = screen.getByRole('group', { name: 'Totals' });
    expect(strip.querySelectorAll('dt')).toHaveLength(3);
    const net = within(strip).getByText('−₹1,200');
    expect(net.tagName).toBe('DD');
    expect(net).toHaveClass('text-red-700', 'tabular-nums');
    expect(within(strip).getByText('after expenses')).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('can sit inside a card without a second box', () => {
    render(<StatStrip label="Open work" items={ITEMS} bare />);
    expect(screen.getByRole('group', { name: 'Open work' })).not.toHaveClass('border');
  });
});
