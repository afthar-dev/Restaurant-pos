import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { PaymentDonut } from './PaymentDonut';

describe('PaymentDonut', () => {
  it('shows the total in the middle, a slice per used mode and every mode in the legend', () => {
    render(
      <main>
        <PaymentDonut payments={{ CASH: 500_000, UPI: 1_000_000, CARD: 0 }} />
      </main>,
    );
    expect(screen.getByText('Most paid by UPI: 67%')).toBeInTheDocument();
    expect(screen.getByText('₹15,000')).toBeInTheDocument();
    expect(document.querySelectorAll('.recharts-pie-sector')).toHaveLength(2);
    const legend = within(screen.getByRole('list', { name: 'Payment modes' }));
    expect(legend.getByText('Card').closest('li')).toHaveTextContent('Card₹00%');
    expect(legend.getByText('Cash').closest('li')).toHaveTextContent('Cash₹5,00033%');
  });

  it('shows shares that add up to 100% even when they do not divide evenly', () => {
    render(<PaymentDonut payments={{ CASH: 100, UPI: 100, CARD: 100 }} />);
    const legend = within(screen.getByRole('list', { name: 'Payment modes' }));
    expect(legend.getByText('Cash').closest('li')).toHaveTextContent('34%');
    expect(legend.getByText('UPI').closest('li')).toHaveTextContent('33%');
    expect(legend.getByText('Card').closest('li')).toHaveTextContent('33%');
  });

  it('draws one full ring when everyone paid the same way', () => {
    render(<PaymentDonut payments={{ CASH: 0, UPI: 900_000, CARD: 0 }} />);
    expect(document.querySelectorAll('.recharts-pie-sector')).toHaveLength(1);
    expect(screen.getByText('Most paid by UPI: 100%')).toBeInTheDocument();
  });

  it('draws nothing without payments', () => {
    const { container } = render(<PaymentDonut payments={{ CASH: 0, UPI: 0, CARD: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <PaymentDonut payments={{ CASH: 500_000, UPI: 1_000_000, CARD: 0 }} />
      </main>,
    );
    await expectNoAxeViolations();
  });
});
