import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { bill, line, order } from '@/test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import { BillActions } from './billing/BillActions';
import { FloorGrid } from './FloorGrid';
import { OrderPanel } from './OrderPanel';
import { TableActions } from './TableActions';
import type { FloorAreaStatus } from './types';

function as(permissions: Permission[], role: 'CASHIER' | 'MANAGER' = 'CASHIER') {
  useSession.getState().setSession(sessionBody(role, permissions));
}

const running = (orderId: string, extra: object = {}) => ({
  orderId,
  status: 'OPEN' as const,
  guests: 2,
  itemCount: 1,
  subtotal: 3000,
  openedAt: '2026-10-06T10:00:00Z',
  ...extra,
});

const floor: FloorAreaStatus[] = [
  {
    id: 'a1',
    name: 'AC Hall',
    sortOrder: 0,
    tables: [
      { id: 't1', name: 'T1', seats: 4, order: running('o1') },
      { id: 't2', name: 'T2', seats: 2, order: null },
      { id: 't3', name: 'T3', seats: 4, order: running('o3') },
      { id: 't4', name: 'T4', seats: 4, order: running('o1', { mergedInto: 'T1' }) },
    ],
  },
];

function body(mock: ReturnType<typeof mockApi>, method: string, path: string) {
  return JSON.parse(String(callsTo(mock, method, path)[0]?.[1]?.body));
}

describe('voiding a bill', () => {
  it('voids with a reason when the user may void', async () => {
    as(['bill.print', 'bill.void', 'payment.take'], 'MANAGER');
    const mock = mockApi({
      'POST /api/bills/b1/void': () => json(bill({ status: 'VOID' }), 201),
    });
    renderWithProviders(<BillActions bill={bill()} onPaid={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    const sheet = await screen.findByRole('dialog', { name: 'Void bill 12' });
    fireEvent.change(within(sheet).getByLabelText('Reason'), { target: { value: 'Wrong table' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Void bill' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/bills/b1/void').length).toBe(1);
    expect(body(mock, 'POST', '/api/bills/b1/void')).toEqual({ reason: 'Wrong table' });
  });

  it('asks a manager to approve when a cashier voids', async () => {
    as(['bill.print', 'payment.take']);
    const mock = mockApi({
      'GET /api/auth/approvers': () => json([{ id: 'm1', name: 'Meena' }]),
      'POST /api/auth/override': () => json({ overrideToken: 'tok' }, 201),
      'POST /api/bills/b1/void': () => json(bill({ status: 'VOID' }), 201),
    });
    renderWithProviders(<BillActions bill={bill({ status: 'PAID' })} onPaid={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Void (manager)' }));
    const sheet = await screen.findByRole('dialog', { name: 'Void bill 12' });
    fireEvent.change(within(sheet).getByLabelText('Reason'), { target: { value: 'Refund' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Void bill' }));
    await within(sheet).findByRole('option', { name: 'Meena' });
    fireEvent.change(within(sheet).getByLabelText('Manager'), { target: { value: 'm1' } });
    fireEvent.change(within(sheet).getByLabelText('Manager PIN'), { target: { value: '9999' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Approve' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/bills/b1/void').length).toBe(1);
    const init = callsTo(mock, 'POST', '/api/bills/b1/void')[0]?.[1];
    expect(new Headers(init?.headers).get('x-override-token')).toBe('tok');
  });

  it('needs a reason', async () => {
    as(['bill.print', 'bill.void'], 'MANAGER');
    const mock = mockApi({});
    renderWithProviders(<BillActions bill={bill()} onPaid={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    const sheet = await screen.findByRole('dialog', { name: 'Void bill 12' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Void bill' }));
    expect(await within(sheet).findByText('Give a short reason.')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/bills/b1/void')).toHaveLength(0);
  });
});

describe('moving and merging tables', () => {
  it('moves the order to a free table', async () => {
    as(['order.take', 'table.manage']);
    const mock = mockApi({
      'GET /api/floor/status': () => json(floor),
      'POST /api/orders/o1/move': () => json(order({ table: { id: 't2', name: 'T2' } }), 201),
    });
    renderWithProviders(<TableActions order={order()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move table' }));
    const sheet = await screen.findByRole('dialog', { name: 'Move T1 to' });
    const targets = await within(sheet).findAllByRole('button', { name: /^Move to/ });
    expect(targets.map((b) => b.textContent)).toEqual(['T2']);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Move to T2' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/move').length).toBe(1);
    expect(body(mock, 'POST', '/api/orders/o1/move')).toEqual({ tableId: 't2' });
    const init = callsTo(mock, 'POST', '/api/orders/o1/move')[0]?.[1];
    expect(new Headers(init?.headers).get('If-Match')).toBe('3');
  });

  it('merges another running table into this order', async () => {
    as(['order.take', 'table.manage']);
    const mock = mockApi({
      'GET /api/floor/status': () => json(floor),
      'POST /api/orders/o1/merge': () => json(order(), 201),
    });
    renderWithProviders(<TableActions order={order()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Merge table' }));
    const sheet = await screen.findByRole('dialog', { name: 'Merge into T1' });
    const targets = await within(sheet).findAllByRole('button', { name: /^Merge / });
    expect(targets.map((b) => b.textContent)).toEqual(['T3']);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Merge T3 into this order' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/merge').length).toBe(1);
    expect(body(mock, 'POST', '/api/orders/o1/merge')).toEqual({ fromOrderId: 'o3' });
  });

  it('is not offered for parcels or without the permission', () => {
    as(['order.take']);
    mockApi({});
    const { unmount } = renderWithProviders(<TableActions order={order()} />);
    expect(screen.queryByRole('button', { name: 'Move table' })).toBeNull();
    unmount();
    as(['order.take', 'table.manage']);
    renderWithProviders(
      <TableActions order={order({ type: 'PARCEL', table: null, tokenNo: 4 })} />,
    );
    expect(screen.queryByRole('button', { name: 'Move table' })).toBeNull();
  });

  it('shows merged tables on the order and on the floor', async () => {
    as(['order.take', 'table.manage']);
    mockApi({
      'GET /api/orders/o1': () => json(order({ mergedTables: [{ id: 't4', name: 'T4' }] })),
      'GET /api/floor/status': () => json(floor),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    expect(await screen.findByRole('heading', { name: 'T1 + T4' })).toBeInTheDocument();
    renderWithProviders(<FloorGrid selectedOrderId={null} onSelect={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'T4, with T1' })).toBeInTheDocument();
  });
});

describe('serving', () => {
  it('marks a ready ticket served', async () => {
    as(['order.take']);
    const ready = order({
      items: [line({ id: 'l1', status: 'SENT', kotId: 'k1' })],
      kots: [
        {
          id: 'k1',
          kotNo: 7,
          type: 'NEW',
          status: 'READY',
          stationId: 'tandoor',
          stationName: 'Tandoor',
          createdAt: '',
          print: 'NONE',
        },
      ],
    });
    const mock = mockApi({
      'GET /api/orders/o1': () => json(ready),
      'POST /api/kots/k1/served': () => json({ id: 'k1', status: 'SERVED' }, 201),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Served KOT 7' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/kots/k1/served').length).toBe(1);
  });
});
