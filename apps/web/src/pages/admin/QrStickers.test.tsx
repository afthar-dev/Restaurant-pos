import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '../../auth/store';
import type * as PrintWorker from '../../print/PrintWorker';
import { renderQrStickers, stickerUrl } from '../../print/qrStickers';
import { callsTo, json, mockApi, sessionBody } from '../../test/mock-api';
import { renderWithProviders } from '../../test/render';
import { QrStickers } from './QrStickers';

const printed: string[] = [];
vi.mock('../../print/PrintWorker', async (original) => ({
  ...(await original<typeof PrintWorker>()),
  printHtmlInIframe: vi.fn(async (html: string) => {
    printed.push(html);
  }),
}));

const codes = [
  { id: 't1', name: 'T1', areaName: 'AC Hall', qrToken: 'a'.repeat(43) },
  { id: 't2', name: 'T<2>', areaName: 'AC Hall', qrToken: 'b'.repeat(43) },
];

describe('sticker sheet', () => {
  it('points each sticker at the table menu', () => {
    expect(stickerUrl('https://pos.spicegarden.in', 'abc')).toBe(
      'https://pos.spicegarden.in/qr/?t=abc',
    );
  });

  it('draws a card per table with its QR code, escaping names', async () => {
    const html = await renderQrStickers(codes, 'Spice Garden', 'https://pos.example.in');
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).toContain('Spice Garden');
    expect(html).toContain('T1');
    expect(html).toContain('T&lt;2&gt;');
    expect(html).not.toContain('T<2>');
    expect(html).toContain('Scan to see the menu and order');
  });
});

describe('QR stickers in Admin → Tables', () => {
  it('prints every sticker', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    printed.length = 0;
    mockApi({
      'GET /api/tables/qr': () => json(codes),
      'GET /api/outlet': () => json({ name: 'Spice Garden' }),
    });
    renderWithProviders(<QrStickers />);
    await screen.findByRole('button', { name: 'New QR code for T1' });
    fireEvent.click(screen.getByRole('button', { name: 'Print all stickers' }));
    await expect.poll(() => printed.length).toBe(1);
    expect(printed[0]).toContain('T1');
  });

  it('replaces a lost sticker after a warning and offers to print it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    printed.length = 0;
    const mock = mockApi({
      'GET /api/tables/qr': () => json(codes),
      'GET /api/outlet': () => json({ name: 'Spice Garden' }),
      'POST /api/tables/t1/qr/rotate': () => json({ id: 't1', qrToken: 'z'.repeat(43) }, 201),
    });
    renderWithProviders(<QrStickers />);
    fireEvent.click(await screen.findByRole('button', { name: 'New QR code for T1' }));
    expect(
      screen.getByText('Replace the QR code for T1? The old sticker stops working at once.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, new code for T1' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/tables/t1/qr/rotate').length).toBe(1);
    const done = await screen.findByRole('status');
    expect(done).toHaveTextContent('T1 has a new QR code.');
    fireEvent.click(within(done).getByRole('button', { name: 'Print the new sticker' }));
    await expect.poll(() => printed.length).toBe(1);
    expect(printed[0]).toContain('T1');
  });
});
