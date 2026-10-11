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
  varianceAlertPaise: 10000,
  pettyCashLimitPaise: 200000,
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
    expect(vi.mocked(shrinkPhoto)).toHaveBeenCalledWith(expect.any(File), 512, {
      transparent: true,
    });
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
  it('saves the cash variance alert in paise, default ₹100', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    const mock = mockApi({
      'GET /api/outlet': () => json(settings),
      'PATCH /api/outlet': ({ body }) => json({ ...settings, ...(body as object) }),
    });
    renderRoute('/admin/settings');
    const field = await screen.findByLabelText('Variance alert above (₹)');
    expect(field).toHaveValue('100');
    fireEvent.change(field, { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('status', { name: 'Save result' })).toHaveTextContent('Saved');
    const [call] = callsTo(mock, 'PATCH', '/api/outlet');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ varianceAlertPaise: 25000 });
  });

  it('saves the petty cash limit in paise, default ₹2,000', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    const mock = mockApi({
      'GET /api/outlet': () => json(settings),
      'PATCH /api/outlet': ({ body }) => json({ ...settings, ...(body as object) }),
    });
    renderRoute('/admin/settings');
    const field = await screen.findByLabelText('Petty cash limit (₹)');
    expect(field).toHaveValue('2000');
    fireEvent.change(field, { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('status', { name: 'Save result' })).toHaveTextContent('Saved');
    const [call] = callsTo(mock, 'PATCH', '/api/outlet');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ pettyCashLimitPaise: 150000 });
  });

  it('refuses a blank petty cash limit instead of sending zero', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    const mock = mockApi({ 'GET /api/outlet': () => json(settings) });
    renderRoute('/admin/settings');
    fireEvent.change(await screen.findByLabelText('Petty cash limit (₹)'), {
      target: { value: '  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Enter a limit in rupees')).toBeInTheDocument();
    expect(callsTo(mock, 'PATCH', '/api/outlet')).toHaveLength(0);
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

  describe('GSTIN for GST schemes', () => {
    const open = async (outlet: object, patch?: () => Response) => {
      useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
      const mock = mockApi({
        'GET /api/outlet': () => json(outlet),
        ...(patch ? { 'PATCH /api/outlet': patch } : {}),
      });
      renderRoute('/admin/settings');
      return { mock, gstin: await screen.findByLabelText('GSTIN') };
    };

    it('marks the GSTIN as required for Regular and Composition, not for Not registered', async () => {
      const { gstin } = await open({ ...settings, taxScheme: 'REGULAR' });
      expect(gstin).toHaveAttribute('aria-required', 'true');
      const scheme = screen.getByLabelText('GST scheme');
      fireEvent.change(scheme, { target: { value: 'COMPOSITION' } });
      expect(gstin).toHaveAttribute('aria-required', 'true');
      fireEvent.change(scheme, { target: { value: 'NONE' } });
      expect(gstin).toHaveAttribute('aria-required', 'false');
    });

    it('stops a GST scheme without a GSTIN before calling the server', async () => {
      const { mock } = await open({ ...settings, taxScheme: 'NONE' });
      fireEvent.change(screen.getByLabelText('GST scheme'), { target: { value: 'COMPOSITION' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
      expect(await screen.findByText('Add your GSTIN to charge GST.')).toBeInTheDocument();
      expect(callsTo(mock, 'PATCH', '/api/outlet')).toHaveLength(0);
    });

    it('still saves other settings on an older outlet that has no GSTIN', async () => {
      const { mock } = await open({ ...settings, taxScheme: 'REGULAR' }, () =>
        json({ ...settings, billFooter: 'Thanks' }),
      );
      fireEvent.change(screen.getByLabelText('Bill footer text'), { target: { value: 'Thanks' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
      expect(await screen.findByRole('status', { name: 'Save result' })).toHaveTextContent('Saved');
      expect(JSON.parse(String(callsTo(mock, 'PATCH', '/api/outlet')[0]?.[1]?.body))).toEqual({
        billFooter: 'Thanks',
      });
    });

    it.each([
      ['REGULAR', null, true],
      ['COMPOSITION', null, true],
      ['NONE', null, false],
      ['REGULAR', '27AAPFU0939F1ZV', false],
    ])('red warning for saved %s with GSTIN %s: %s', async (taxScheme, gstin, shown) => {
      await open({ ...settings, taxScheme, gstin });
      const text = 'Add your GSTIN — you are charging GST without one';
      if (shown) expect(await screen.findByRole('alert')).toHaveTextContent(text);
      else expect(screen.queryByText(text)).toBeNull();
    });

    it('shows the message the server sends back', async () => {
      await open({ ...settings, taxScheme: 'NONE' }, () =>
        json({ code: 'VALIDATION', message: 'Add your GSTIN to charge GST.' }, 400),
      );
      fireEvent.change(screen.getByLabelText('GSTIN'), { target: { value: '27AAPFU0939F1ZV' } });
      fireEvent.change(screen.getByLabelText('GST scheme'), { target: { value: 'REGULAR' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
      expect(await screen.findByText('Add your GSTIN to charge GST.')).toBeInTheDocument();
    });
  });
});
