import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody, type Handler } from '@/test/mock-api';
import { renderRoute, renderWithProviders } from '@/test/render';
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
  const job = (id: string, kotNo = 7) => ({
    id,
    kind: 'KOT',
    payload: { ...payload, kotNo },
    attempts: 0,
  });

  /** A server that leases each pending job to one claim at a time, like the real one. */
  function jobsApi(jobs: ReturnType<typeof job>[], doneStatus: () => number = () => 201) {
    let pending = [...jobs];
    const handlers: Record<string, Handler> = {
      'POST /api/print/jobs/claim': () => json(pending, 201),
    };
    for (const j of jobs) {
      handlers[`POST /api/print/jobs/${j.id}/done`] = () => {
        const status = doneStatus();
        if (status !== 201) return json({ code: 'SERVER_ERROR', message: 'Down' }, status);
        pending = pending.filter((p) => p.id !== j.id);
        return json({ id: j.id, status: 'PRINTED', attempts: 1 }, 201);
      };
    }
    return mockApi(handlers);
  }

  const doneBody = (mock: ReturnType<typeof mockApi>, id: string, index = 0) =>
    JSON.parse(String(callsTo(mock, 'POST', `/api/print/jobs/${id}/done`)[index]?.[1]?.body));

  it('prints a waiting job once and reports it done', async () => {
    const mock = jobsApi([job('j1')]);
    const printHtml = vi.fn(async (_html: string) => undefined);
    renderWithProviders(<PrintWorker printHtml={printHtml} />);
    await expect.poll(() => callsTo(mock, 'POST', '/api/print/jobs/j1/done').length).toBe(1);
    expect(printHtml).toHaveBeenCalledTimes(1);
    expect(printHtml.mock.calls[0]?.[0]).toContain('KOT 7');
    expect(doneBody(mock, 'j1')).toEqual({ ok: true });
  });

  it('prints several jobs in order', async () => {
    const mock = jobsApi([job('j1', 7), job('j2', 8)]);
    const printHtml = vi.fn(async (_html: string) => undefined);
    renderWithProviders(<PrintWorker printHtml={printHtml} />);
    await expect.poll(() => callsTo(mock, 'POST', '/api/print/jobs/j2/done').length).toBe(1);
    expect(printHtml).toHaveBeenCalledTimes(2);
    expect(printHtml.mock.calls[0]?.[0]).toContain('KOT 7');
    expect(printHtml.mock.calls[1]?.[0]).toContain('KOT 8');
  });

  it('reports a failed print so the server can retry or give up', async () => {
    const mock = jobsApi([job('j1')]);
    const printHtml = vi.fn(async (_html: string) => {
      throw new Error('printer offline');
    });
    renderWithProviders(<PrintWorker printHtml={printHtml} />);
    await expect.poll(() => callsTo(mock, 'POST', '/api/print/jobs/j1/done').length).toBe(1);
    expect(doneBody(mock, 'j1')).toEqual({ ok: false });
  });

  it('retries a lost report without printing the ticket again', async () => {
    let failures = 1;
    const mock = jobsApi([job('j1')], () => (failures-- > 0 ? 503 : 201));
    const printHtml = vi.fn(async (_html: string) => undefined);
    renderWithProviders(<PrintWorker printHtml={printHtml} />);
    await expect.poll(() => callsTo(mock, 'POST', '/api/print/jobs/j1/done').length).toBe(2);
    expect(printHtml).toHaveBeenCalledTimes(1);
    expect(doneBody(mock, 'j1', 1)).toEqual({ ok: true });
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
