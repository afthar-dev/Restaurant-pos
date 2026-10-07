import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import { ManagerApproval } from './ManagerApproval';

const approvers = () => json([{ id: 'm1', name: 'Meena' }]);

describe('ManagerApproval', () => {
  it('gets a one-time approval with the manager PIN', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print']));
    const mock = mockApi({
      'GET /api/auth/approvers': approvers,
      'POST /api/auth/override': () => json({ overrideToken: 'tok' }, 201),
    });
    const onApproved = vi.fn();
    renderWithProviders(
      <ManagerApproval permission="bill.void" onApproved={onApproved} onCancel={() => undefined} />,
    );
    await screen.findByRole('option', { name: 'Meena' });
    fireEvent.change(screen.getByLabelText('Manager'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Manager PIN'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Enter the 4–6 digit PIN.')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/auth/override')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Manager PIN'), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await expect.poll(() => onApproved.mock.calls.length).toBe(1);
    expect(onApproved).toHaveBeenCalledWith('tok');
    expect(JSON.parse(String(callsTo(mock, 'POST', '/api/auth/override')[0]?.[1]?.body))).toEqual({
      userId: 'm1',
      pin: '9999',
      permission: 'bill.void',
    });
  });

  it('shows a wrong PIN from the server', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print']));
    mockApi({
      'GET /api/auth/approvers': approvers,
      'POST /api/auth/override': () =>
        json({ code: 'INVALID_CREDENTIALS', message: 'Wrong PIN. 4 tries left.' }, 401),
    });
    renderWithProviders(
      <ManagerApproval
        permission="discount.unlimited"
        onApproved={() => undefined}
        onCancel={() => undefined}
      />,
    );
    await screen.findByRole('option', { name: 'Meena' });
    fireEvent.change(screen.getByLabelText('Manager'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Manager PIN'), { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Wrong PIN. 4 tries left.')).toBeInTheDocument();
  });
});
