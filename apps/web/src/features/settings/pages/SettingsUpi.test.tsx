import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const settings = {
  id: 'outlet-1',
  name: 'Spice Garden',
  gstin: null,
  taxScheme: 'NONE',
  address: null,
  phone: null,
  fssaiNumber: null,
  billHeader: null,
  billFooter: null,
  cashierDiscountCapBp: 1000,
  waiterCanCollectPayment: false,
  parcelPaymentTiming: 'PAY_FIRST',
  billPackagingCharge: 0,
  varianceAlertPaise: 10000,
  pettyCashLimitPaise: 200000,
  upiVpa: null as string | null,
  upiPayee: null as string | null,
  printUpiQr: true,
  logoUrl: null,
};

function setup() {
  useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
  return mockApi({
    'GET /api/outlet': () => json(settings),
    'PATCH /api/outlet': ({ body }) => json({ ...settings, ...(body as object) }),
  });
}

const patched = (mock: ReturnType<typeof mockApi>) =>
  JSON.parse(String(callsTo(mock, 'PATCH', '/api/outlet')[0]?.[1]?.body));

describe('Settings: UPI', () => {
  it('saves the UPI ID, payee name and the print switch', async () => {
    const mock = setup();
    renderRoute('/admin/settings');
    expect(await screen.findByLabelText('Print UPI QR on bills')).toBeChecked();
    fireEvent.change(screen.getByLabelText('UPI ID'), {
      target: { value: ' spicegarden@okicici ' },
    });
    fireEvent.change(screen.getByLabelText('Payee name'), { target: { value: 'Spice Garden' } });
    fireEvent.click(screen.getByLabelText('Print UPI QR on bills'));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('status', { name: 'Save result' })).toHaveTextContent('Saved');
    expect(patched(mock)).toEqual({
      upiVpa: 'spicegarden@okicici',
      upiPayee: 'Spice Garden',
      printUpiQr: false,
    });
  });

  it('refuses a UPI ID that is not name@bank, without calling the server', async () => {
    const mock = setup();
    renderRoute('/admin/settings');
    fireEvent.change(await screen.findByLabelText('UPI ID'), { target: { value: 'spicegarden' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Enter a UPI ID like name@bank')).toBeInTheDocument();
    expect(callsTo(mock, 'PATCH', '/api/outlet')).toHaveLength(0);
  });
});
