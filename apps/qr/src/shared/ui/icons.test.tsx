import { render, screen } from '@testing-library/react';
import { Minus } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { FoodMark } from './FoodMark';
import { Icon } from './Icon';

describe('Icon', () => {
  it('is decorative by default and sized from three steps', () => {
    const { container } = render(<Icon as={Minus} size="lg" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('size-6');
  });

  it('becomes an image with a name when labelled', () => {
    render(<Icon as={Minus} label="One less" />);
    expect(screen.getByRole('img', { name: 'One less' })).toHaveClass('size-5');
  });
});

describe('FoodMark', () => {
  it('draws egg as a ring so it differs from veg by shape, not only colour', () => {
    render(
      <>
        <FoodMark type="VEG" />
        <FoodMark type="EGG" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Veg' }).querySelector('circle')).toHaveAttribute(
      'fill',
      'currentColor',
    );
    const egg = screen.getByRole('img', { name: 'Egg' }).querySelector('circle');
    expect(egg).toHaveAttribute('fill', 'none');
    expect(egg).toHaveAttribute('stroke', 'currentColor');
  });

  it('names each food type and draws its symbol', () => {
    render(
      <>
        <FoodMark type="VEG" />
        <FoodMark type="NON_VEG" />
        <FoodMark type="EGG" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Veg' }).querySelector('circle')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Non-veg' }).querySelector('path')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Egg' }).getAttribute('style')).toContain(
      'var(--color-egg)',
    );
  });
});
