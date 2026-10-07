import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const staff = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Priya',
    phone: '9876500001',
    role: 'OWNER',
    hasPassword: true,
    hasPin: false,
    archivedAt: null,
    lockedUntil: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Arun',
    phone: '9876500002',
    role: 'CASHIER',
    hasPassword: false,
    hasPin: true,
    archivedAt: null,
    lockedUntil: null,
  },
];

function asOwner() {
  useSession
    .getState()
    .setSession(
      sessionBody('OWNER', ['users.manage', 'settings.manage', 'devices.manage', 'audit.view']),
    );
}

describe('StaffPage', () => {
  it('lists staff with their sign-in methods', async () => {
    asOwner();
    mockApi({ 'GET /api/users': () => json(staff) });
    renderRoute('/admin/staff');
    const row = (await screen.findByText('Arun')).closest('tr')!;
    expect(within(row).getByText('9876500002')).toBeInTheDocument();
    expect(within(row).getByText('PIN')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('adds a cashier with a PIN and asks for a password only for owners and managers', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/users': () => json(staff),
      'POST /api/users': ({ body }) => json({ ...(body as object), id: 'new', hasPin: true }, 201),
    });
    renderRoute('/admin/staff');
    fireEvent.click(await screen.findByRole('button', { name: 'Add staff' }));

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'MANAGER' } });
    expect(screen.getByLabelText('Password')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'CASHIER' } });
    expect(screen.queryByLabelText('Password')).toBeNull();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ravi' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876500003' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2468' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('button', { name: 'Add staff' });
    const [call] = callsTo(mock, 'POST', '/api/users');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      name: 'Ravi',
      phone: '9876500003',
      role: 'CASHIER',
      pin: '2468',
    });
  });

  it('shows field errors without calling the server', async () => {
    asOwner();
    const mock = mockApi({ 'GET /api/users': () => json(staff) });
    renderRoute('/admin/staff');
    fireEvent.click(await screen.findByRole('button', { name: 'Add staff' }));
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a 10-digit mobile number')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/users')).toHaveLength(0);
  });

  it('archives after an on-page confirmation', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/users': () => json(staff),
      [`POST /api/users/${staff[1]!.id}/archive`]: () =>
        json({ ...staff[1], archivedAt: '2026-10-05T00:00:00Z' }, 201),
    });
    renderRoute('/admin/staff');
    const row = (await screen.findByText('Arun')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Archive' }));
    expect(callsTo(mock, 'POST', `/api/users/${staff[1]!.id}/archive`)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, archive Arun' }));
    await screen.findByText('Arun');
    expect(callsTo(mock, 'POST', `/api/users/${staff[1]!.id}/archive`)).toHaveLength(1);
  });
});
