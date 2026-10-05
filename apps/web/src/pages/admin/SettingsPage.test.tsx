import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '../../auth/store';
import { callsTo, json, mockApi, sessionBody } from '../../test/mock-api';
import { renderRoute } from '../../test/render';

const settings = {
  id: 'outlet-1',
  name: 'Spice Garden',
  gstin: null,
  taxScheme: 'REGULAR',
  address: null,
  phone: null,
  fssaiNumber: null,
  billHeader: null,
  billFooter: null,
  cashierDiscountCapBp: 1000,
  waiterCanCollectPayment: false,
  parcelPaymentTiming: 'PAY_FIRST',
};

describe('SettingsPage', () => {
  it('saves the cashier discount cap as basis points', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    const mock = mockApi({
      'GET /api/outlet': () => json(settings),
      'PATCH /api/outlet': ({ body }) => json({ ...settings, ...(body as object) }),
    });
    renderRoute('/admin/settings');

    const cap = await screen.findByLabelText('Cashier discount limit (%)');
    expect(cap).toHaveValue(10);
    fireEvent.change(cap, { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('status', { name: 'Save result' })).toHaveTextContent('Saved');
    const [call] = callsTo(mock, 'PATCH', '/api/outlet');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ cashierDiscountCapBp: 1500 });
  });

  it('rejects an invalid GSTIN without calling the server', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    const mock = mockApi({ 'GET /api/outlet': () => json(settings) });
    renderRoute('/admin/settings');

    fireEvent.change(await screen.findByLabelText('GSTIN'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Enter a valid 15-character GSTIN')).toBeInTheDocument();
    expect(callsTo(mock, 'PATCH', '/api/outlet')).toHaveLength(0);
  });
});
