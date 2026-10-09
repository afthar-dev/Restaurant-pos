import { render, screen } from '@testing-library/react';
import { Banknote } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { FoodMark } from './FoodMark';
import { Icon } from './Icon';
import { PaymentIcon } from './PaymentIcon';

describe('Icon', () => {
  it('is decorative by default and sized from three steps', () => {
    const { container } = render(<Icon as={Banknote} size="lg" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('size-6');
  });

  it('becomes an image with a name when labelled', () => {
    render(<Icon as={Banknote} label="Cash" />);
    expect(screen.getByRole('img', { name: 'Cash' })).toHaveClass('size-5');
  });
});

describe('FoodMark', () => {
  it('names each food type and draws its symbol', () => {
    render(
      <main>
        <FoodMark type="VEG" />
        <FoodMark type="NON_VEG" />
        <FoodMark type="EGG" />
      </main>,
    );
    const veg = screen.getByRole('img', { name: 'Veg' });
    const non = screen.getByRole('img', { name: 'Non-veg' });
    expect(screen.getByRole('img', { name: 'Egg' })).toBeInTheDocument();
    expect(veg.querySelector('circle')).not.toBeNull();
    expect(non.querySelector('path')).not.toBeNull();
    expect(veg.getAttribute('style')).toContain('var(--color-veg)');
    expect(non.getAttribute('style')).toContain('var(--color-nonveg)');
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <FoodMark type="VEG" />
      </main>,
    );
    await expectNoAxeViolations();
  });
});

describe('PaymentIcon', () => {
  it('draws a different icon for each mode, hidden from screen readers', () => {
    const { container } = render(
      <>
        <PaymentIcon mode="CASH" />
        <PaymentIcon mode="UPI" />
        <PaymentIcon mode="CARD" />
      </>,
    );
    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs).toHaveLength(3);
    expect(new Set(svgs.map((s) => s.getAttribute('class'))).size).toBe(3);
    for (const s of svgs) expect(s).toHaveAttribute('aria-hidden', 'true');
  });
});
