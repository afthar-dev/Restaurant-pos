import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '../../auth/store';
import { order, qrRequest } from '../../test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '../../test/mock-api';
import { renderWithProviders } from '../../test/render';
import { FloorGrid } from '../FloorGrid';
import { OrderPanel } from '../OrderPanel';
import { QrInbox } from './QrInbox';
import { QrRequestCard } from './QrRequestCard';

const STAFF: Permission[] = ['order.take', 'order.approveQr', 'bill.print'];

function as(permissions: Permission[] = STAFF) {
  useSession.getState().setSession(sessionBody('WAITER', permissions));
}

const body = (mock: ReturnType<typeof mockApi>, path: string) =>
  JSON.parse(String(callsTo(mock, 'POST', path)[0]?.[1]?.body));

describe('QR request card', () => {
  const waiting = order({ status: 'PENDING_APPROVAL', qrPending: [qrRequest()] });

  it('shows what the customer asked for and approves it as sent', async () => {
    as();
    const mock = mockApi({
      'POST /api/qr/submissions/q1/approve': () => json(order({ status: 'OPEN' }), 201),
    });
    renderWithProviders(<QrRequestCard order={waiting} request={qrRequest()} />);
    const card = screen.getByRole('region', { name: 'QR order from T1' });
    expect(within(card).getByText('2 × Paneer Tikka (Half)')).toBeInTheDocument();
    expect(within(card).getByText('Cheese')).toBeInTheDocument();
    expect(within(card).getByText('“peanut allergy”')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/qr/submissions/q1/approve').length).toBe(1);
    expect(body(mock, '/api/qr/submissions/q1/approve')).toEqual({});
  });

  it('approves an edited request', async () => {
    as();
    const mock = mockApi({
      'POST /api/qr/submissions/q1/approve': () => json(order({ status: 'OPEN' }), 201),
    });
    renderWithProviders(<QrRequestCard order={waiting} request={qrRequest()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'One less Paneer Tikka' }));
    fireEvent.click(screen.getByRole('button', { name: 'One less Tandoori Roti' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve changes' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/qr/submissions/q1/approve').length).toBe(1);
    expect(body(mock, '/api/qr/submissions/q1/approve')).toEqual({
      lines: [{ variantId: 'paneer-h', quantity: 1, addonIds: ['cheese'] }],
    });
  });

  it('rejects with a reason', async () => {
    as();
    const mock = mockApi({
      'POST /api/qr/submissions/q1/reject': () => json(order({ status: 'CANCELLED' }), 201),
    });
    renderWithProviders(<QrRequestCard order={waiting} request={qrRequest()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText('Reason (optional)'), {
      target: { value: 'Kitchen closing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, reject' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/qr/submissions/q1/reject').length).toBe(1);
    expect(body(mock, '/api/qr/submissions/q1/reject')).toEqual({ reason: 'Kitchen closing' });
  });

  it('shows why an approval failed so staff can edit', async () => {
    as();
    mockApi({
      'POST /api/qr/submissions/q1/approve': () =>
        json(
          { code: 'ITEM_UNAVAILABLE', message: 'Paneer Tikka is not available right now.' },
          409,
        ),
    });
    renderWithProviders(<QrRequestCard order={waiting} request={qrRequest()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Paneer Tikka is not available right now.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
  });

  it('shows the request without buttons to staff who cannot approve', () => {
    as(['order.take']);
    mockApi({});
    renderWithProviders(<QrRequestCard order={waiting} request={qrRequest()} />);
    expect(screen.getByRole('region', { name: 'QR order from T1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});

describe('QR inbox', () => {
  it('lists waiting tables and opens one', async () => {
    as();
    mockApi({ 'GET /api/qr/pending': () => json([qrRequest()]) });
    const onOpen = vi.fn();
    renderWithProviders(<QrInbox onOpen={onOpen} />);
    const inbox = await screen.findByRole('region', { name: 'QR orders waiting' });
    fireEvent.click(within(inbox).getByRole('button', { name: /^T1 · 3 dishes/ }));
    expect(onOpen).toHaveBeenCalledWith('o1');
  });

  it('stays out of the way when nothing waits or the user cannot approve', async () => {
    as();
    const mock = mockApi({ 'GET /api/qr/pending': () => json([]) });
    const { unmount } = renderWithProviders(<QrInbox onOpen={() => undefined} />);
    await expect.poll(() => callsTo(mock, 'GET', '/api/qr/pending').length).toBe(1);
    expect(screen.queryByRole('region', { name: 'QR orders waiting' })).toBeNull();
    unmount();
    as(['order.take']);
    const none = mockApi({});
    renderWithProviders(<QrInbox onOpen={() => undefined} />);
    expect(callsTo(none, 'GET', '/api/qr/pending')).toHaveLength(0);
  });
});

describe('order and floor', () => {
  it('heads a waiting QR order and shows its request', async () => {
    as();
    mockApi({
      'GET /api/orders/o1': () =>
        json(order({ status: 'PENDING_APPROVAL', waiter: null, qrPending: [qrRequest()] })),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    expect(await screen.findByText('QR order waiting for approval')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'QR order from T1' })).toBeInTheDocument();
  });

  it('marks a table with a waiting QR order on the floor', async () => {
    as();
    mockApi({
      'GET /api/floor/status': () =>
        json([
          {
            id: 'a1',
            name: 'AC Hall',
            sortOrder: 0,
            tables: [
              {
                id: 't1',
                name: 'T1',
                seats: 4,
                order: {
                  orderId: 'o1',
                  status: 'PENDING_APPROVAL',
                  guests: null,
                  itemCount: 0,
                  subtotal: 0,
                  openedAt: '',
                },
              },
            ],
          },
        ]),
    });
    renderWithProviders(<FloorGrid selectedOrderId={null} onSelect={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'T1, QR order waiting' })).toBeInTheDocument();
  });
});
