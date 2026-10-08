import { describe, expect, it } from 'vitest';
import { SETUP_PERMISSIONS, setupProgress, type SetupData } from './steps';

const ALL = ['settings.manage', 'menu.manage', 'users.manage', 'devices.manage'];

const FRESH: SetupData = {
  outlet: { name: 'Main Outlet', address: null, phone: null, gstin: null, taxScheme: 'REGULAR' },
  menu: { categories: [{ items: [] }] },
  floor: [],
  printers: [],
  staff: [{ role: 'OWNER', hasPin: true, archivedAt: null }],
  devices: [],
};

const READY: SetupData = {
  outlet: {
    name: 'Anna Mess',
    address: '12 MG Road',
    phone: '9000000001',
    gstin: '29ABCDE1234F1Z5',
    taxScheme: 'REGULAR',
  },
  menu: { categories: [{ items: [{}] }] },
  floor: [{ tables: [{}] }],
  printers: [{ purpose: 'BILL' }],
  staff: [{ role: 'CASHIER', hasPin: true, archivedAt: null }],
  devices: [{ revokedAt: null }],
};

const run = (data: SetupData, extra: Partial<Parameters<typeof setupProgress>[0]> = {}) =>
  setupProgress({ permissions: ALL, skipped: [], data, failed: [], ...extra });

const status = (data: SetupData, id: string, extra = {}) =>
  run(data, extra).steps.find((s) => s.id === id)?.status;

describe('setupProgress', () => {
  it('shows a new restaurant as 0 of 6, in the spec order', () => {
    const p = run(FRESH);
    expect(p.steps.map((s) => s.id)).toEqual([
      'details',
      'menu',
      'tables',
      'printer',
      'staff',
      'device',
    ]);
    expect(p.steps.every((s) => s.status === 'todo')).toBe(true);
    expect([p.done, p.total, p.complete]).toEqual([0, 6, false]);
  });

  it('marks everything done for a ready restaurant', () => {
    expect(run(READY)).toMatchObject({ done: 6, total: 6, complete: true, loading: false });
  });

  it('does not accept the seeded outlet name in any case or spacing', () => {
    const outlet = { ...READY.outlet!, name: '  main OUTLET ' };
    expect(status({ ...READY, outlet }, 'details')).toBe('todo');
  });

  it('needs address and phone, and GSTIN unless the scheme is NONE', () => {
    expect(status({ ...READY, outlet: { ...READY.outlet!, phone: ' ' } }, 'details')).toBe('todo');
    expect(status({ ...READY, outlet: { ...READY.outlet!, gstin: null } }, 'details')).toBe('todo');
    expect(
      status({ ...READY, outlet: { ...READY.outlet!, gstin: null, taxScheme: 'NONE' } }, 'details'),
    ).toBe('done');
  });

  it('counts only bill printers, active non-owner staff with a PIN and active devices', () => {
    expect(status({ ...READY, printers: [{ purpose: 'KOT' }] }, 'printer')).toBe('todo');
    expect(
      status(
        {
          ...READY,
          staff: [
            { role: 'OWNER', hasPin: true, archivedAt: null },
            { role: 'WAITER', hasPin: false, archivedAt: null },
            { role: 'CASHIER', hasPin: true, archivedAt: '2026-10-01T00:00:00Z' },
          ],
        },
        'staff',
      ),
    ).toBe('todo');
    expect(status({ ...READY, devices: [{ revokedAt: '2026-10-01T00:00:00Z' }] }, 'device')).toBe(
      'todo',
    );
  });

  it('counts skipped steps as complete, but shows Done once the step is done', () => {
    const skipped = ['tables', 'printer', 'staff'];
    expect(status(FRESH, 'tables', { skipped })).toBe('skipped');
    expect(run(FRESH, { skipped }).done).toBe(3);
    expect(status(READY, 'tables', { skipped })).toBe('done');
  });

  it('ignores skips for steps that cannot be skipped', () => {
    expect(status(FRESH, 'menu', { skipped: ['menu'] })).toBe('todo');
  });

  it('only shows steps the user may do', () => {
    const p = run(FRESH, { permissions: ['settings.manage', 'menu.manage'] });
    expect(p.steps.map((s) => s.id)).toEqual(['details', 'menu', 'tables', 'printer']);
    expect(p.total).toBe(4);
    expect(run(FRESH, { permissions: ['bill.print'] })).toMatchObject({
      total: 0,
      complete: false,
    });
  });

  it('reports loading and failed checks, and is never complete with one', () => {
    expect(status({ ...READY, devices: undefined }, 'device')).toBe('loading');
    expect(run({ ...READY, devices: undefined }).loading).toBe(true);
    const failed = run(READY, { failed: ['staff'] });
    expect(failed.steps.find((s) => s.id === 'staff')?.status).toBe('error');
    expect([failed.failed, failed.complete]).toEqual([true, false]);
  });

  it('links each step with from=setup and exposes the permissions', () => {
    expect(run(FRESH).steps.map((s) => s.path)).toEqual([
      '/admin/settings',
      '/admin/menu',
      '/admin/tables',
      '/admin/kitchen',
      '/admin/staff',
      '/admin/devices',
    ]);
    expect([...SETUP_PERMISSIONS].sort()).toEqual([...ALL].sort());
  });
});
