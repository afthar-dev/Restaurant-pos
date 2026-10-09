import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const ownerPerms = ['settings.manage', 'menu.manage', 'users.manage'];
const STATION = '00000000-0000-4000-8000-0000000000a1';
const AREA = '00000000-0000-4000-8000-0000000000e1';

function asOwner() {
  useSession.getState().setSession(sessionBody('OWNER', ownerPerms));
}

function body(mock: ReturnType<typeof mockApi>, method: string, path: string) {
  const [call] = callsTo(mock, method, path);
  return JSON.parse(String(call?.[1]?.body));
}

describe('TaxPage', () => {
  it('explains what to add when there are no tax rates', async () => {
    asOwner();
    mockApi({ 'GET /api/tax-rates': () => json([]) });
    renderRoute('/admin/tax');
    const title = await screen.findByText('No tax rates yet');
    expect(title.closest('div')?.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(/GST rate your dishes use/)).toBeInTheDocument();
  });

  it('adds a GST rate entered as a percentage', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/tax-rates': () =>
        json([
          { id: 't1', name: 'GST 5%', cgstBp: 250, sgstBp: 250, totalBp: 500, archivedAt: null },
        ]),
      'POST /api/tax-rates': ({ body: b }) => json({ id: 't2', ...(b as object) }, 201),
    });
    renderRoute('/admin/tax');
    expect(await screen.findByText('GST 5%')).toBeInTheDocument();
    expect(screen.getByText('2.5% + 2.5%')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Archive/ }).querySelector('svg.lucide-archive'),
    ).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'GST 18%' } });
    fireEvent.change(screen.getByLabelText('Total GST (%)'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tax rate' }));

    await screen.findByText('GST 5%');
    await expect.poll(() => callsTo(mock, 'POST', '/api/tax-rates').length).toBe(1);
    expect(body(mock, 'POST', '/api/tax-rates')).toEqual({ name: 'GST 18%', totalBp: 1800 });
  });
});

describe('KitchenPage', () => {
  it('explains what to add when there are no printers', async () => {
    asOwner();
    mockApi({
      'GET /api/stations': () => json([{ id: STATION, name: 'Kitchen', archivedAt: null }]),
      'GET /api/printers': () => json([]),
    });
    renderRoute('/admin/kitchen');
    const title = await screen.findByText('No printers yet');
    expect(title.closest('div')?.querySelector('svg')).not.toBeNull();
  });

  it('asks for a station before saving a KOT printer', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/stations': () => json([{ id: STATION, name: 'Kitchen', archivedAt: null }]),
      'GET /api/printers': () => json([]),
    });
    renderRoute('/admin/kitchen');
    fireEvent.change(await screen.findByLabelText('Printer name'), {
      target: { value: 'Kitchen printer' },
    });
    fireEvent.change(screen.getByLabelText('Prints'), { target: { value: 'KOT' } });
    fireEvent.change(screen.getByLabelText('Station'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add printer' }));
    expect(await screen.findByText('Choose the kitchen station')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/printers')).toHaveLength(0);
  });

  it('adds a station', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/stations': () => json([]),
      'GET /api/printers': () => json([]),
      'POST /api/stations': ({ body: b }) => json({ id: 's2', ...(b as object) }, 201),
    });
    renderRoute('/admin/kitchen');
    fireEvent.change(await screen.findByLabelText('Station name'), {
      target: { value: 'Tandoor' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add station' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/stations').length).toBe(1);
    expect(body(mock, 'POST', '/api/stations')).toEqual({ name: 'Tandoor' });
  });
});

describe('TablesPage', () => {
  it('shows areas with tables and adds a table to an area', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/floor': () =>
        json([
          { id: AREA, name: 'AC Hall', sortOrder: 0, tables: [{ id: 'x1', name: 'T1', seats: 4 }] },
        ]),
      'POST /api/tables': ({ body: b }) => json({ id: 'x2', ...(b as object) }, 201),
    });
    renderRoute('/admin/tables');
    const section = (await screen.findByRole('heading', { name: 'AC Hall' })).closest('section')!;
    expect(within(section).getByText('T1')).toBeInTheDocument();

    fireEvent.change(within(section).getByLabelText('Table name'), { target: { value: 'T2' } });
    fireEvent.change(within(section).getByLabelText('Seats'), { target: { value: '6' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Add table' }));

    await expect.poll(() => callsTo(mock, 'POST', '/api/tables').length).toBe(1);
    expect(body(mock, 'POST', '/api/tables')).toEqual({ areaId: AREA, name: 'T2', seats: 6 });
  });
});

describe('editing setup data (review #3)', () => {
  it('renames a station', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/stations': () => json([{ id: STATION, name: 'Kitchen', archivedAt: null }]),
      'GET /api/printers': () => json([]),
      [`PUT /api/stations/${STATION}`]: ({ body: b }) => json({ id: STATION, ...(b as object) }),
    });
    renderRoute('/admin/kitchen');
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Kitchen' }));
    fireEvent.change(screen.getByLabelText('New name for Kitchen'), {
      target: { value: 'Main kitchen' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await expect.poll(() => callsTo(mock, 'PUT', `/api/stations/${STATION}`).length).toBe(1);
    expect(body(mock, 'PUT', `/api/stations/${STATION}`)).toEqual({ name: 'Main kitchen' });
  });

  it('edits a printer', async () => {
    asOwner();
    const printer = {
      id: 'p1',
      name: 'Kitchen printer',
      purpose: 'KOT',
      station: { id: STATION, name: 'Kitchen' },
      mode: 'BROWSER',
      paperWidthMm: 80,
      address: null,
      device: null,
    };
    const mock = mockApi({
      'GET /api/stations': () => json([{ id: STATION, name: 'Kitchen', archivedAt: null }]),
      'GET /api/printers': () => json([printer]),
      'PUT /api/printers/p1': ({ body: b }) => json({ ...printer, ...(b as object) }),
    });
    renderRoute('/admin/kitchen');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Kitchen printer' }));
    fireEvent.change(screen.getByLabelText('Paper width', { selector: '#printer-p1-width' }), {
      target: { value: '58' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save printer' }));
    await expect.poll(() => callsTo(mock, 'PUT', '/api/printers/p1').length).toBe(1);
    expect(body(mock, 'PUT', '/api/printers/p1')).toEqual({
      name: 'Kitchen printer',
      purpose: 'KOT',
      stationId: STATION,
      mode: 'BROWSER',
      paperWidthMm: 58,
      address: null,
      deviceId: null,
    });
  });

  it('changes the seats of a table without recreating it', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/floor': () =>
        json([
          { id: AREA, name: 'AC Hall', sortOrder: 0, tables: [{ id: 'x1', name: 'T1', seats: 4 }] },
        ]),
      'PUT /api/tables/x1': ({ body: b }) => json({ id: 'x1', ...(b as object) }),
    });
    renderRoute('/admin/tables');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit table T1' }));
    fireEvent.change(screen.getByLabelText('Seats for T1'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save table' }));
    await expect.poll(() => callsTo(mock, 'PUT', '/api/tables/x1').length).toBe(1);
    expect(body(mock, 'PUT', '/api/tables/x1')).toEqual({ areaId: AREA, name: 'T1', seats: 6 });
  });

  it('renames an area', async () => {
    asOwner();
    const mock = mockApi({
      'GET /api/floor': () => json([{ id: AREA, name: 'AC Hall', sortOrder: 3, tables: [] }]),
      [`PUT /api/areas/${AREA}`]: ({ body: b }) => json({ id: AREA, ...(b as object) }),
    });
    renderRoute('/admin/tables');
    fireEvent.click(await screen.findByRole('button', { name: 'Rename AC Hall' }));
    fireEvent.change(screen.getByLabelText('New name for AC Hall'), {
      target: { value: 'AC Hall 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await expect.poll(() => callsTo(mock, 'PUT', `/api/areas/${AREA}`).length).toBe(1);
    expect(body(mock, 'PUT', `/api/areas/${AREA}`)).toEqual({ name: 'AC Hall 1', sortOrder: 3 });
  });
});
