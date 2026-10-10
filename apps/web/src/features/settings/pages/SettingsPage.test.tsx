import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as photo from '@/shared/lib/photo';
import { shrinkPhoto } from '@/shared/lib/photo';

vi.mock('@/shared/lib/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof photo>()),
  shrinkPhoto: vi.fn(async () => new Blob(['logo'], { type: 'image/webp' })),
}));
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

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
  billPackagingCharge: 0,
  logoUrl: null as string | null,
};

describe('SettingsPage', () => {
  it('adds a logo, shrunk to 512 px, and removes it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    const withLogo = { ...settings, logoUrl: '/api/media/logo.webp' };
    const mock = mockApi({
      'GET /api/outlet': () => json(settings),
      'PUT /api/outlet/logo': () => json(withLogo),
      'DELETE /api/outlet/logo': () => json(settings),
    });
    renderRoute('/admin/settings');
    const input = await screen.findByLabelText('Add logo');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    });
    await expect.poll(() => callsTo(mock, 'PUT', '/api/outlet/logo').length).toBe(1);
    expect(vi.mocked(shrinkPhoto)).toHaveBeenCalledWith(expect.any(File), 512);
    expect(callsTo(mock, 'PUT', '/api/outlet/logo')[0]?.[1]?.body).toBeInstanceOf(FormData);
    expect(await screen.findByRole('img', { name: 'Restaurant logo' })).toHaveAttribute(
      'src',
      '/api/media/logo.webp',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    await expect.poll(() => callsTo(mock, 'DELETE', '/api/outlet/logo').length).toBe(1);
    expect(await screen.findByLabelText('Add logo')).toBeInTheDocument();
  });

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

  it('saves the parcel bag charge in paise', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    const mock = mockApi({
      'GET /api/outlet': () => json(settings),
      'PATCH /api/outlet': ({ body }) => json({ ...settings, ...(body as object) }),
    });
    renderRoute('/admin/settings');
    fireEvent.change(await screen.findByLabelText('Parcel bag charge (₹)'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('status', { name: 'Save result' })).toHaveTextContent('Saved');
    const [call] = callsTo(mock, 'PATCH', '/api/outlet');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ billPackagingCharge: 1000 });
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
