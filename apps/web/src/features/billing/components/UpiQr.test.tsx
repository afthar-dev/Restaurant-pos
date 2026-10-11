import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as qr from '@/shared/lib/qrSvg';
import { qrSvg } from '@/shared/lib/qrSvg';
import { renderWithProviders } from '@/test/render';
import { UpiQr } from './UpiQr';

vi.mock('@/shared/lib/qrSvg', async (importOriginal) => {
  const actual = await importOriginal<typeof qr>();
  return { ...actual, qrSvg: vi.fn(actual.qrSvg) };
});

describe('UpiQr', () => {
  it('draws the QR for the amount and says what to scan', async () => {
    renderWithProviders(
      <UpiQr vpa="spicegarden@okicici" payee="Spice Garden" amountPaise={24200} note="Bill 135" />,
    );
    expect(await screen.findByRole('img', { name: 'UPI QR code' })).toBeInTheDocument();
    expect(screen.getByText('Scan to pay ₹242')).toBeInTheDocument();
    expect(vi.mocked(qrSvg)).toHaveBeenCalledWith(
      'upi://pay?pa=spicegarden%40okicici&pn=Spice%20Garden&am=242.00&cu=INR&tn=Bill%20135',
    );
  });
});
