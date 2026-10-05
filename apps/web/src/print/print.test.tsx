import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '../auth/store';
import { callsTo, json, mockApi, sessionBody } from '../test/mock-api';
import { renderRoute, renderWithProviders } from '../test/render';
import { renderKotTicket, type KotPrintPayload } from './kotTicket';
import { PrintWorker } from './PrintWorker';

const payload: KotPrintPayload = {
  kind: 'KOT',
  kotNo: 7,
  kotType: 'NEW',
  stationName: 'Kitchen',
  orderType: 'DINE_IN',
  tableName: 'T1',
  tokenNo: null,
  customerName: null,
  waiterName: 'Arun',
  guests: 3,
  createdAt: '2026-10-06T14:12:00.000Z',
  paperWidthMm: 80,
  lines: [
    {
      quantity: 2,
      itemName: 'Paneer <b>Tikka</b>',
      variantName: 'Half',
      addons: ['Cheese'],
      note: 'less spicy',
      combo: [],
    },
  ],
};

describe('renderKotTicket', () => {
  it('prints the KOT number, table, dishes, add-ons and notes, escaping text', () => {
    const html = renderKotTicket(payload);
    expect(html).toContain('KOT 7');
    expect(html).toContain('T1');
    expect(html).toContain('2 × Paneer &lt;b&gt;Tikka&lt;/b&gt; (Half)');
    expect(html).toContain('Cheese');
    expect(html).toContain('less spicy');
    expect(html).toContain('80mm');
    expect(html).not.toContain('<b>Tikka');
  });

  it('marks cancellations loudly and shows parcel tokens', () => {
    const html = renderKotTicket({
      ...payload,
      kotType: 'CANCEL',
      orderType: 'PARCEL',
      tableName: null,
      tokenNo: 12,
      paperWidthMm: 58,
    });
    expect(html).toContain('CANCELLED');
    expect(html).toContain('Parcel #12');
    expect(html).toContain('58mm');
  });
});

describe('PrintWorker', () => {
  function jobsApi(jobs: { id: string }[]) {
    let pending = jobs.map((j) => ({ ...j, kind: 'KOT', payload, attempts: 0 }));
    return mockApi({
      'GET /api/print/jobs': () => json(pending),
      'POST /api/print/jobs/j1/done': () => {
        pending = [];
        return json({ id: 'j1', status: 'PRINTED' }, 201);
      },
    });
  }

  it('prints a waiting job once and reports it done', async () => {
    const mock = jobsApi([{ id: 'j1' }]);
    const printHtml = vi.fn(async (_html: string) => undefined);
    renderWithProviders(<PrintWorker printHtml={printHtml} />);
    await expect.poll(() => callsTo(mock, 'POST', '/api/print/jobs/j1/done').length).toBe(1);
    expect(printHtml).toHaveBeenCalledTimes(1);
    expect(printHtml.mock.calls[0]?.[0]).toContain('KOT 7');
    expect(
      JSON.parse(String(callsTo(mock, 'POST', '/api/print/jobs/j1/done')[0]?.[1]?.body)),
    ).toEqual({
      ok: true,
    });
  });

  it('reports a failed print so the server can retry or give up', async () => {
    const mock = jobsApi([{ id: 'j1' }]);
    const printHtml = vi.fn(async (_html: string) => {
      throw new Error('printer offline');
    });
    renderWithProviders(<PrintWorker printHtml={printHtml} />);
    await expect.poll(() => callsTo(mock, 'POST', '/api/print/jobs/j1/done').length).toBe(1);
    expect(
      JSON.parse(String(callsTo(mock, 'POST', '/api/print/jobs/j1/done')[0]?.[1]?.body)),
    ).toEqual({
      ok: false,
    });
  });
});

describe('printer setup', () => {
  it('assigns a printer to the device that prints it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['settings.manage', 'devices.manage']));
    const mock = mockApi({
      'GET /api/stations': () =>
        json([{ id: '00000000-0000-4000-8000-0000000000a1', name: 'Kitchen', archivedAt: null }]),
      'GET /api/printers': () => json([]),
      'GET /api/devices': () =>
        json([
          {
            id: '00000000-0000-4000-8000-0000000000d1',
            name: 'Counter 1',
            type: 'POS',
            createdBy: { id: 'u', name: 'U' },
            createdAt: '',
            lastSeenAt: null,
            revokedAt: null,
          },
        ]),
      'POST /api/printers': ({ body }) => json({ id: 'p1', ...(body as object) }, 201),
    });
    renderRoute('/admin/kitchen');
    fireEvent.change(await screen.findByLabelText('Printer name'), {
      target: { value: 'KOT printer' },
    });
    await screen.findByRole('option', { name: 'Counter 1' });
    fireEvent.change(screen.getByLabelText('Printed by'), {
      target: { value: '00000000-0000-4000-8000-0000000000d1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add printer' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/printers').length).toBe(1);
    expect(JSON.parse(String(callsTo(mock, 'POST', '/api/printers')[0]?.[1]?.body))).toMatchObject({
      deviceId: '00000000-0000-4000-8000-0000000000d1',
    });
  });
});
