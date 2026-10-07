import { fireEvent, render, screen } from '@testing-library/react';
import { Check } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { Button, IconButton } from './Button';
import { DataTable } from './DataTable';
import { EmptyState } from './EmptyState';
import { ErrorNote } from './ErrorNote';
import { Field } from './Field';
import { Input } from './inputs';

describe('Button', () => {
  it('blocks clicks and tells assistive tech while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a link with button styles when asked', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/pos">Go to POS</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Go to POS' });
    expect(link.className).toContain('border');
  });

  it('names icon-only buttons for screen readers', () => {
    render(<IconButton label="Close" icon={<Check />} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('shows its text next to the icon, not colour alone', () => {
    render(
      <Badge tone="success" icon={<Check data-testid="icon" />}>
        Paid
      </Badge>,
    );
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  const columns = [{ header: 'Dish', cell: (r: { name: string }) => r.name }];

  it('shows the empty state instead of an empty table', () => {
    render(
      <DataTable
        label="Dishes"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.name}
        empty={<EmptyState title="No dishes yet" />}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No dishes yet')).toBeInTheDocument();
  });

  it('renders a labelled table with header cells', () => {
    render(
      <DataTable
        label="Dishes"
        columns={columns}
        rows={[{ name: 'Roti' }]}
        rowKey={(r) => r.name}
      />,
    );
    const table = screen.getByRole('table', { name: 'Dishes' });
    expect(screen.getByRole('columnheader', { name: 'Dish' })).toBeInTheDocument();
    expect(table).toHaveTextContent('Roti');
  });
});

describe('ErrorNote', () => {
  it('offers a retry when the screen can refetch', () => {
    const onRetry = vi.fn();
    render(<ErrorNote message="Cannot reach the server." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('Field', () => {
  it('links the error to the control and marks it invalid', () => {
    render(
      <Field id="amount" label="Amount" error="Enter an amount">
        <Input id="amount" />
      </Field>,
    );
    const input = screen.getByLabelText('Amount');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter an amount');
  });
});
