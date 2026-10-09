import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import type * as PrintWorker from '@/features/printing/PrintWorker';
import type * as QrImages from '../qrImages';
import { renderQrStickers, stickerUrl } from '@/features/printing/templates/qrStickers';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import { QrStickers } from './QrStickers';

const printed: string[] = [];
vi.mock('@/features/printing/PrintWorker', async (original) => ({
  ...(await original<typeof PrintWorker>()),
  printHtmlInIframe: vi.fn(async (html: string) => {
    printed.push(html);
  }),
}));

const saved: { name: string; size: number }[] = [];
const zipped: string[][] = [];
vi.mock('../qrImages', async (original) => ({
  ...(await original<typeof QrImages>()),
  qrPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  zipFiles: vi.fn(async (files: { name: string; blob: Blob }[]) => {
    zipped.push(files.map((f) => f.name));
    return new Blob(['zip']);
  }),
  saveBlob: vi.fn((blob: Blob, name: string) => {
    saved.push({ name, size: blob.size });
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
  function setup(extra: Parameters<typeof mockApi>[0] = {}) {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    printed.length = 0;
    saved.length = 0;
    zipped.length = 0;
    return mockApi({
      'GET /api/tables/qr': () => json(codes),
      'GET /api/outlet': () => json({ name: 'Spice Garden' }),
      ...extra,
    });
  }

  it('shows every table with its QR code and opens one large to download or print', async () => {
    setup();
    renderWithProviders(<QrStickers />);
    expect(await screen.findByRole('img', { name: 'QR code for T1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open QR code for T1' }));
    const dialog = await screen.findByRole('dialog', { name: 'QR code for T1' });
    expect(
      within(dialog).getByText(stickerUrl(window.location.origin, codes[0]!.qrToken)),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download PNG' }));
    await expect.poll(() => saved.map((f) => f.name)).toEqual(['T1-qr.png']);
    const printOne = within(dialog).getByRole('button', { name: 'Print sticker' });
    await waitFor(() => expect(printOne).toBeEnabled());
    fireEvent.click(printOne);
    await expect.poll(() => printed.length).toBe(1);
    expect(printed[0]).toContain('T1');
  });

  it('downloads every QR code in one ZIP', async () => {
    setup();
    renderWithProviders(<QrStickers />);
    await screen.findByRole('img', { name: 'QR code for T1' });
    fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
    await expect.poll(() => saved.map((f) => f.name)).toEqual(['table-qr-codes.zip']);
    expect(zipped).toEqual([['AC Hall T1-qr.png', 'AC Hall T_2_-qr.png']]);
  });

  it('prints every sticker', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage']));
    printed.length = 0;
    mockApi({
      'GET /api/tables/qr': () => json(codes),
      'GET /api/outlet': () => json({ name: 'Spice Garden' }),
    });
    renderWithProviders(<QrStickers />);
    await screen.findByRole('button', { name: 'Open QR code for T1' });
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
    fireEvent.click(await screen.findByRole('button', { name: 'Open QR code for T1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Replace code' }));
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
