import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { expectNoAxeViolations } from '@/test/a11y';
import { bill } from '@/test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import type { Bill } from '../types';
import { SettlePanel } from './SettlePanel';

const CASHIER: Permission[] = ['bill.print', 'payment.take'];
const PAID = () => json(bill({ status: 'PAID', paid: 47300, due: 0 }), 201);

function setup(handlers = {}, props: Partial<Parameters<typeof SettlePanel>[0]> = {}) {
  useSession.getState().setSession(sessionBody('CASHIER', CASHIER));
  const mock = mockApi(handlers);
  const onPaid = vi.fn();
  const onMore = vi.fn();
  const view = renderWithProviders(
    <SettlePanel bill={bill()} onPaid={onPaid} onMore={onMore} {...props} />,
  );
  return { mock, onPaid, onMore, view };
}

const posts = (mock: ReturnType<typeof mockApi>) => callsTo(mock, 'POST', '/api/bills/b1/payments');
const sent = (mock: ReturnType<typeof mockApi>, i = 0) =>
  JSON.parse(String(posts(mock)[i]?.[1]?.body));
const keyOf = (mock: ReturnType<typeof mockApi>, i: number) =>
  new Headers(posts(mock)[i]?.[1]?.headers).get('Idempotency-Key');

describe('SettlePanel', () => {
  it('takes a whole-bill UPI payment in two taps', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    expect(screen.getByRole('heading', { name: 'Bill 12 · ₹473 due' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'UPI', amount: 47300 });
  });

  it('records nothing after Back', () => {
    const { mock } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus();
    expect(posts(mock)).toHaveLength(0);
  });

  it('takes exact cash without a tendered amount', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    expect(screen.getByRole('button', { name: 'Exact' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 cash' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'CASH', amount: 47300 });
  });

  it('shows the change for a note and sends what was handed over', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('button', { name: '₹500' }));
    expect(screen.getByText('Change ₹27')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 cash · change ₹27' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'CASH', amount: 47300, tendered: 50000 });
  });

  it('blocks short cash typed in Other', () => {
    const { mock } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.change(screen.getByLabelText('Other amount (₹)'), { target: { value: '400' } });
    expect(screen.getByText('₹73 more needed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm ₹473 cash' })).toBeDisabled();
    expect(posts(mock)).toHaveLength(0);
  });

  it('retries a failed payment with the same request id', async () => {
    let calls = 0;
    const { mock, onPaid } = setup({
      'POST /api/bills/b1/payments': () =>
        ++calls === 1 ? json({ code: 'NETWORK', message: 'Network down' }, 503) : PAID(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(keyOf(mock, 1)).toBe(keyOf(mock, 0));
  });

  it('records once on a double tap', async () => {
    const { mock } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    const confirm = screen.getByRole('button', { name: 'Confirm ₹473 by UPI' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await expect.poll(() => posts(mock).length).toBe(1);
    expect(posts(mock)).toHaveLength(1);
  });

  it('goes back to the modes when the amount due changes', () => {
    const { view } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    const changed: Bill = bill({ due: 40000, paid: 7300 });
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <SettlePanel bill={changed} onPaid={() => undefined} onMore={() => undefined} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Bill 12 · ₹400 due' })).toBeInTheDocument();
  });

  it('opens the full sheet for split or part payments', () => {
    const { onMore } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Split or part payment' }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('focuses Cash when asked, for a bill just created', () => {
    setup({}, { autoFocus: true });
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveFocus();
  });

  it('has no accessibility problems in either state', async () => {
    setup();
    await expectNoAxeViolations();
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    await expectNoAxeViolations();
  });
});

describe('SettlePanel review fixes', () => {
  it('lets a long confirm label wrap instead of overflowing', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('button', { name: '₹500' }));
    expect(screen.getByRole('button', { name: /^Confirm/ })).toHaveClass('whitespace-normal');
  });

  it('keeps Confirm on when the empty Other field only gets focus', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.focus(screen.getByLabelText('Other amount (₹)'));
    expect(screen.getByRole('button', { name: 'Confirm ₹473 cash' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Exact' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not pull focus out of another field when the amount due changes', () => {
    const { view } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    const search = document.createElement('input');
    document.body.append(search);
    search.focus();
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <SettlePanel
          bill={bill({ due: 40000, paid: 7300 })}
          onPaid={() => undefined}
          onMore={() => undefined}
        />
      </QueryClientProvider>,
    );
    expect(search).toHaveFocus();
    search.remove();
  });
});

describe('SettlePanel keys', () => {
  it('picks a mode with U and confirms with Enter', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.keyDown(document.body, { key: 'u' });
    expect(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' })).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'UPI', amount: 47300 });
  });

  it('goes back with Escape', () => {
    setup();
    fireEvent.keyDown(document.body, { key: 'k' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Card' })).toBeInTheDocument();
  });

  it('ignores keys typed in a field', () => {
    setup();
    const search = document.createElement('input');
    document.body.append(search);
    fireEvent.keyDown(search, { key: 'u' });
    expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull();
    search.remove();
  });

  it('leaves Enter on a focused button to that button', () => {
    const { mock } = setup();
    fireEvent.keyDown(document.body, { key: 'u' });
    const back = screen.getByRole('button', { name: 'Back' });
    back.focus();
    fireEvent.keyDown(back, { key: 'Enter' });
    expect(posts(mock)).toHaveLength(0);
  });

  it('ignores letters typed in an open menu', () => {
    setup();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    fireEvent.keyDown(document.body, { key: 'u' });
    expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull();
    menu.remove();
  });

  it('ignores keys while a dialog is open', () => {
    setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    fireEvent.keyDown(document.body, { key: 'u' });
    expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull();
    dialog.remove();
  });
});
