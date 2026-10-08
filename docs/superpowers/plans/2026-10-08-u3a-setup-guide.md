# U3a Setup Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Setup guide" page and home card that list the six things a new restaurant must do, tick each off from real data, link to the right Admin screen and back.

**Architecture:** A new `features/setup` folder. `steps.ts` holds the step table and a pure `setupProgress()` that turns data + permissions + skipped ids into step statuses. `skipped.ts` keeps skips in `localStorage`. `useSetupProgress()` runs the existing admin queries (now with `enabled`) for visible steps. `SetupPage`, `SetupCard` and a progress bar render it. Nav, route, home and `AdminLayout` (back link) wire it in. No API change.

**Tech Stack:** React 19, TanStack Query, React Router 7, Tailwind 4 kit (`shared/ui`), lucide-react, Vitest + Testing Library + vitest-axe.

**Spec:** `docs/superpowers/specs/2026-10-08-u3a-setup-guide-design.md`

## Global Constraints

- Frontend only (`apps/web`). No API or `packages/shared` change.
- Step table, done rules, help sentences and skip labels exactly as spec §2.
- Skips: `localStorage` key `rpos.setup.skipped`, JSON array of step ids, all access in try/catch.
- Steps visible only with their permission; queries for hidden steps never run.
- Kit components and colour tokens only (`apps/web/ARCHITECTURE.md` "UI kit"); targets ≥ 44 px.
- Feature rules: other features are used only through their `index.ts`; `pnpm lint` (from repo root) also checks feature cycles.
- Commands from `apps/web`: `npx vitest run <path>`, `npx tsc --noEmit -p tsconfig.json`.

## Review Focus

1. A brand-new restaurant (seed data only) → 0 of 6, every step To do; the seeded "Main Outlet" name must not count as filled in.
2. A cashier or waiter → no nav entry, no home card, `/setup` refused, and no `/api/outlet`, `/api/users` or `/api/devices` request.
3. `localStorage` unavailable or holding garbage → page still works, skips just do not persist.
4. One admin query fails → that step says "Could not check" with Retry; the guide is not reported complete; the home card stays hidden.
5. A skipped step that later gets done → shows Done, not Skipped.

Each is pinned by a test in Tasks 1–3.

---

### Task 1: Step rules and skip storage

**Files:**
- Create: `apps/web/src/features/setup/steps.ts`
- Create: `apps/web/src/features/setup/skipped.ts`
- Test: `apps/web/src/features/setup/steps.test.ts`
- Test: `apps/web/src/features/setup/skipped.test.ts`

**Interfaces:**
- Produces:
  - `type StepId = 'details' | 'menu' | 'tables' | 'printer' | 'staff' | 'device'`
  - `interface SetupData { outlet?: OutletLike; menu?: { categories: { items: unknown[] }[] }; floor?: { tables: unknown[] }[]; printers?: { purpose: 'KOT' | 'BILL' }[]; staff?: { role: string; hasPin: boolean; archivedAt: string | null }[]; devices?: { revokedAt: string | null }[] }` with `OutletLike = { name: string; address: string | null; phone: string | null; gstin: string | null; taxScheme: 'REGULAR' | 'COMPOSITION' | 'NONE' }`
  - `type StepStatus = 'done' | 'todo' | 'skipped' | 'loading' | 'error'`
  - `interface StepView { id: StepId; title: string; help: string; path: string; skipLabel?: string; status: StepStatus }`
  - `interface SetupProgress { steps: StepView[]; done: number; total: number; complete: boolean; loading: boolean; failed: boolean }`
  - `setupProgress(input: { permissions: readonly string[]; skipped: readonly string[]; data: SetupData; failed: readonly StepId[] }): SetupProgress`
  - `SETUP_PERMISSIONS: Permission[]` (union of step permissions)
  - `readSkipped(): string[]`, `writeSkipped(ids: string[]): void`

- [ ] **Step 1: Write the failing tests**

`steps.test.ts`:

```ts
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
    expect(run(FRESH, { permissions: ['bill.print'] })).toMatchObject({ total: 0, complete: false });
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
```

`skipped.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSkipped, writeSkipped } from './skipped';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('skipped steps storage', () => {
  it('round-trips the skipped ids', () => {
    writeSkipped(['tables', 'staff']);
    expect(readSkipped()).toEqual(['tables', 'staff']);
  });

  it('reads garbage as nothing skipped', () => {
    localStorage.setItem('rpos.setup.skipped', '{oops');
    expect(readSkipped()).toEqual([]);
    localStorage.setItem('rpos.setup.skipped', '[1,"tables",null]');
    expect(readSkipped()).toEqual(['tables']);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSkipped()).toEqual([]);
    expect(() => writeSkipped(['tables'])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/setup`
Expected: FAIL, cannot resolve `./steps` and `./skipped`.

- [ ] **Step 3: Implement `steps.ts`**

```ts
import type { Permission } from '@rpos/shared';

export type StepId = 'details' | 'menu' | 'tables' | 'printer' | 'staff' | 'device';

type OutletLike = {
  name: string;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  taxScheme: 'REGULAR' | 'COMPOSITION' | 'NONE';
};

/** What the checks read; a missing field means that data is still loading. */
export interface SetupData {
  outlet?: OutletLike;
  menu?: { categories: { items: unknown[] }[] };
  floor?: { tables: unknown[] }[];
  printers?: { purpose: 'KOT' | 'BILL' }[];
  staff?: { role: string; hasPin: boolean; archivedAt: string | null }[];
  devices?: { revokedAt: string | null }[];
}

export type StepStatus = 'done' | 'todo' | 'skipped' | 'loading' | 'error';

export interface StepView {
  id: StepId;
  title: string;
  help: string;
  path: string;
  skipLabel?: string;
  status: StepStatus;
}

export interface SetupProgress {
  steps: StepView[];
  done: number;
  total: number;
  complete: boolean;
  loading: boolean;
  failed: boolean;
}

interface StepDef extends Omit<StepView, 'status'> {
  permission: Permission;
  /** undefined while its data loads. */
  isDone: (data: SetupData) => boolean | undefined;
}

const filled = (value: string | null | undefined) => Boolean(value?.trim());

/** The seed names the outlet this; it does not count as filled in. */
const SEEDED_NAME = 'main outlet';

const STEPS: StepDef[] = [
  {
    id: 'details',
    title: 'Restaurant details',
    help: 'Your name, address, phone and GSTIN print on every bill.',
    path: '/admin/settings',
    permission: 'settings.manage',
    isDone: ({ outlet }) =>
      outlet &&
      outlet.name.trim().toLowerCase() !== SEEDED_NAME &&
      filled(outlet.address) &&
      filled(outlet.phone) &&
      (outlet.taxScheme === 'NONE' || filled(outlet.gstin)),
  },
  {
    id: 'menu',
    title: 'Menu',
    help: 'Add the dishes you sell with their prices. Categories decide which kitchen gets the ticket.',
    path: '/admin/menu',
    permission: 'menu.manage',
    isDone: ({ menu }) => menu && menu.categories.some((c) => c.items.length > 0),
  },
  {
    id: 'tables',
    title: 'Tables and QR stickers',
    help: 'Add your dining areas and tables, then print the QR stickers customers scan to order.',
    path: '/admin/tables',
    skipLabel: 'We only do parcels',
    permission: 'settings.manage',
    isDone: ({ floor }) => floor && floor.some((a) => a.tables.length > 0),
  },
  {
    id: 'printer',
    title: 'Bill printer',
    help: "Connect the printer for bills. Without one, bills print from the browser's print window.",
    path: '/admin/kitchen',
    skipLabel: "Print bills from this computer's browser",
    permission: 'settings.manage',
    isDone: ({ printers }) => printers && printers.some((p) => p.purpose === 'BILL'),
  },
  {
    id: 'staff',
    title: 'Staff',
    help: 'Give cashiers and waiters their own PIN so every order shows who took it.',
    path: '/admin/staff',
    skipLabel: 'I run the counter myself',
    permission: 'users.manage',
    isDone: ({ staff }) =>
      staff && staff.some((s) => s.role !== 'OWNER' && s.hasPin && s.archivedAt === null),
  },
  {
    id: 'device',
    title: 'This counter',
    help: 'Register this computer as the counter so staff can sign in here with their PIN.',
    path: '/admin/devices',
    permission: 'devices.manage',
    isDone: ({ devices }) => devices && devices.some((d) => d.revokedAt === null),
  },
];

export const SETUP_PERMISSIONS: Permission[] = [...new Set(STEPS.map((s) => s.permission))];

/**
 * Which setup steps this user sees and where each stands. Done always wins over skipped; a
 * check that failed or is still loading never counts as complete.
 */
export function setupProgress(input: {
  permissions: readonly string[];
  skipped: readonly string[];
  data: SetupData;
  failed: readonly StepId[];
}): SetupProgress {
  const steps: StepView[] = STEPS.filter((s) => input.permissions.includes(s.permission)).map(
    ({ permission: _permission, isDone, ...step }) => {
      const done = isDone(input.data);
      const status: StepStatus = input.failed.includes(step.id)
        ? 'error'
        : done === undefined
          ? 'loading'
          : done
            ? 'done'
            : step.skipLabel && input.skipped.includes(step.id)
              ? 'skipped'
              : 'todo';
      return { ...step, status };
    },
  );
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return {
    steps,
    done,
    total: steps.length,
    complete: steps.length > 0 && done === steps.length,
    loading: steps.some((s) => s.status === 'loading'),
    failed: steps.some((s) => s.status === 'error'),
  };
}
```

- [ ] **Step 4: Implement `skipped.ts`**

```ts
const KEY = 'rpos.setup.skipped';

/** Setup steps skipped in this browser. Anything unreadable counts as none. */
export function readSkipped(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeSkipped(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Private window or blocked storage: the skip lasts until reload.
  }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/features/setup`
Expected: PASS (13 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/setup
git commit -m "feat(web): setup guide step rules and skip storage"
```

---

### Task 2: Setup guide page, route and nav

**Files:**
- Modify: `apps/web/src/features/settings/queries.ts`, `features/menu/queries.ts`, `features/tables/queries.ts`, `features/kitchen-setup/queries.ts`, `features/staff/queries.ts`, `features/devices/queries.ts` (optional `enabled`)
- Modify: `apps/web/src/features/tables/index.ts` (export `useFloorLayout`), `features/kitchen-setup/index.ts` (export `usePrinters`), `features/staff/index.ts` (export `useStaff`)
- Create: `apps/web/src/features/setup/useSetupProgress.ts`
- Create: `apps/web/src/features/setup/components/SetupProgressBar.tsx`
- Create: `apps/web/src/features/setup/pages/SetupPage.tsx`
- Create: `apps/web/src/features/setup/index.ts`
- Modify: `apps/web/src/app/navigation.ts`, `apps/web/src/app/routes.tsx`
- Test: `apps/web/src/features/setup/pages/SetupPage.test.tsx`

**Interfaces:**
- Consumes: `setupProgress`, `SETUP_PERMISSIONS`, `readSkipped`, `writeSkipped`, `StepId`, `StepView` (Task 1); `useOutlet`, `useMenu`, `useFloorLayout`, `usePrinters`, `useStaff`, `useDevices` from feature indexes.
- Produces:
  - `useSetupProgress(): SetupProgress & { skip(id: StepId): void; undo(id: StepId): void; retry(id: StepId): void }`
  - `SetupProgressBar({ done, total }: { done: number; total: number })`
  - `SetupPage` (lazy export from `features/setup`), `SETUP_PERMISSIONS`, `useSetupProgress` exported from `features/setup/index.ts`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, screen } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { expectNoAxeViolations } from '@/test/a11y';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const OWNER: Permission[] = [
  'settings.manage',
  'menu.manage',
  'users.manage',
  'devices.manage',
  'bill.print',
];

const OUTLET = {
  name: 'Main Outlet',
  gstin: null,
  taxScheme: 'REGULAR',
  address: null,
  phone: null,
};

function freshApi(overrides = {}) {
  return mockApi({
    'GET /api/outlet': () => json(OUTLET),
    'GET /api/menu': () => json({ categories: [{ id: 'c1', name: 'Starters', items: [] }] }),
    'GET /api/floor': () => json([]),
    'GET /api/printers': () => json([]),
    'GET /api/users': () =>
      json([{ id: 'u1', name: 'Asha', role: 'OWNER', hasPin: true, archivedAt: null }]),
    'GET /api/devices': () => json([]),
    ...overrides,
  });
}

beforeEach(() => localStorage.clear());

describe('SetupPage', () => {
  it('walks a new restaurant through every step', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    freshApi();
    renderRoute('/setup');
    expect(await screen.findByRole('heading', { level: 1, name: 'Setup guide' })).toBeVisible();
    expect(await screen.findByText('0 of 6 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up Restaurant details' })).toHaveAttribute(
      'href',
      '/admin/settings?from=setup',
    );
    expect(screen.getByRole('link', { name: 'Set up This counter' })).toHaveAttribute(
      'href',
      '/admin/devices?from=setup',
    );
    await expectNoAxeViolations();
  });

  it('skips an optional step and undoes it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    freshApi();
    renderRoute('/setup');
    fireEvent.click(await screen.findByRole('button', { name: 'We only do parcels' }));
    expect(screen.getByText('1 of 6 done')).toBeInTheDocument();
    expect(screen.getByText('Skipped — We only do parcels')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('rpos.setup.skipped')!)).toEqual(['tables']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo skip for Tables and QR stickers' }));
    expect(screen.getByText('0 of 6 done')).toBeInTheDocument();
  });

  it('shows a manager only the steps they may do and asks nothing else', async () => {
    useSession
      .getState()
      .setSession(sessionBody('MANAGER', ['settings.manage', 'menu.manage'], 'Meena'));
    const mock = freshApi();
    renderRoute('/setup');
    expect(await screen.findByText('0 of 4 done')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Staff' })).toBeNull();
    expect(callsTo(mock, 'GET', '/api/users')).toHaveLength(0);
    expect(callsTo(mock, 'GET', '/api/devices')).toHaveLength(0);
  });

  it('says when a check failed and retries it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    let calls = 0;
    freshApi({
      'GET /api/devices': () =>
        ++calls === 1 ? json({ code: 'INTERNAL', message: 'Down' }, 500) : json([]),
    });
    renderRoute('/setup');
    fireEvent.click(await screen.findByRole('button', { name: 'Retry This counter' }));
    expect(await screen.findByRole('link', { name: 'Set up This counter' })).toBeInTheDocument();
  });

  it('says the restaurant is ready when everything is done or skipped', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    localStorage.setItem('rpos.setup.skipped', JSON.stringify(['tables', 'printer', 'staff']));
    freshApi({
      'GET /api/outlet': () =>
        json({ ...OUTLET, name: 'Anna Mess', address: '12 MG Road', phone: '9000000001', gstin: '29ABCDE1234F1Z5' }),
      'GET /api/menu': () => json({ categories: [{ id: 'c1', name: 'Starters', items: [{ id: 'i1' }] }] }),
      'GET /api/devices': () => json([{ id: 'd1', revokedAt: null }]),
    });
    renderRoute('/setup');
    expect(await screen.findByText('6 of 6 done')).toBeInTheDocument();
    expect(
      screen.getByText('Ready to serve. Open the day from the POS to take the first order.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to POS' })).toHaveAttribute('href', '/pos');
  });

  it('refuses a cashier', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print'], 'Ravi'));
    const mock = freshApi();
    renderRoute('/setup');
    expect(await screen.findByText(/do not have access/i)).toBeInTheDocument();
    expect(callsTo(mock, 'GET', '/api/outlet')).toHaveLength(0);
  });
});
```

Check the exact refusal text `RequireAuth` shows (`grep -n "access" src/features/auth/components/RequireAuth.tsx`) and use it in the last test if it differs from the regex.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/setup/pages`
Expected: FAIL — `/setup` renders the not-found page (no heading "Setup guide").

- [ ] **Step 3: `enabled` on the six queries and exports**

In each of the six `queries.ts` files, give the hook an optional `enabled` and pass it through. Example for `features/settings/queries.ts`:

```ts
/** The restaurant's details: name and GST for bills, rules for cashiers and parcels. */
export function useOutlet(enabled = true) {
  return useQuery({ queryKey: settingsKeys.outlet, queryFn: fetchOutlet, enabled });
}
```

Same change for `useMenu` (menu), `useFloorLayout` (tables), `usePrinters` (kitchen-setup), `useStaff` (staff), `useDevices` (devices). Add to the indexes:
- `features/tables/index.ts`: `export { useFloorLayout } from './queries';`
- `features/kitchen-setup/index.ts`: `export { usePrinters, useStations } from './queries';` (replace the existing `useStations` line)
- `features/staff/index.ts`: `export { useStaff } from './queries';`

- [ ] **Step 4: `useSetupProgress.ts`**

```ts
import { useState } from 'react';
import { useDevices } from '@/features/devices';
import { usePrinters } from '@/features/kitchen-setup';
import { useMenu } from '@/features/menu';
import { useOutlet } from '@/features/settings';
import { useStaff } from '@/features/staff';
import { useFloorLayout } from '@/features/tables';
import { useSession } from '@/shared/session/store';
import { readSkipped, writeSkipped } from './skipped';
import { setupProgress, type StepId } from './steps';

/** The setup guide for the signed-in user: only the checks they may see are fetched. */
export function useSetupProgress() {
  const permissions = useSession((s) => s.permissions);
  const can = (permission: string) => permissions.includes(permission as never);
  const [skipped, setSkipped] = useState(readSkipped);

  const queries = {
    details: useOutlet(can('settings.manage')),
    menu: useMenu(can('menu.manage')),
    tables: useFloorLayout(can('settings.manage')),
    printer: usePrinters(can('settings.manage')),
    staff: useStaff(can('users.manage')),
    device: useDevices(can('devices.manage')),
  } satisfies Record<StepId, { isError: boolean; refetch: () => unknown }>;

  const failed = (Object.keys(queries) as StepId[]).filter((id) => queries[id].isError);
  const progress = setupProgress({
    permissions,
    skipped,
    failed,
    data: {
      outlet: queries.details.data,
      menu: queries.menu.data,
      floor: queries.tables.data,
      printers: queries.printer.data,
      staff: queries.staff.data,
      devices: queries.device.data,
    },
  });

  const save = (next: string[]) => {
    setSkipped(next);
    writeSkipped(next);
  };

  return {
    ...progress,
    skip: (id: StepId) => save([...new Set([...skipped, id])]),
    undo: (id: StepId) => save(skipped.filter((s) => s !== id)),
    retry: (id: StepId) => void queries[id].refetch(),
  };
}
```

If `permissions` is typed `Permission[]`, type `can` as `(permission: Permission) => boolean` and drop the cast.

- [ ] **Step 5: `SetupProgressBar.tsx`**

```tsx
/** "n of m done" with a bar; announced as a progress bar. */
export function SetupProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-text tabular-nums">{`${done} of ${total} done`}</p>
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-primary-700 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `SetupPage.tsx`**

```tsx
import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle } from 'lucide-react';
import { Link } from 'react-router';
import { useCan } from '@/shared/session/store';
import { Badge, Button, Card, CardBody, LoadingScreen, PageHeader } from '@/shared/ui';
import { SetupProgressBar } from '../components/SetupProgressBar';
import type { StepView } from '../steps';
import { useSetupProgress } from '../useSetupProgress';

/** What a new restaurant still has to do before its first service, one step per row. */
export function SetupPage() {
  const setup = useSetupProgress();
  const canPos = useCan('bill.print');

  if (setup.loading && !setup.failed) return <LoadingScreen />;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Setup guide"
        description={
          setup.complete
            ? 'Ready to serve. Open the day from the POS to take the first order.'
            : 'Work through these steps before your first service. Each one ticks itself off when it is done.'
        }
        actions={
          setup.complete && canPos ? (
            <Button asChild>
              <Link to="/pos">Go to POS</Link>
            </Button>
          ) : undefined
        }
      />
      <SetupProgressBar done={setup.done} total={setup.total} />
      <ol className="flex flex-col gap-3">
        {setup.steps.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            number={index + 1}
            onSkip={() => setup.skip(step.id)}
            onUndo={() => setup.undo(step.id)}
            onRetry={() => setup.retry(step.id)}
          />
        ))}
      </ol>
    </section>
  );
}

function StepRow({
  step,
  number,
  onSkip,
  onUndo,
  onRetry,
}: {
  step: StepView;
  number: number;
  onSkip: () => void;
  onUndo: () => void;
  onRetry: () => void;
}) {
  return (
    <li>
      <Card>
        <CardBody className="flex flex-wrap items-start gap-4">
          <StepIcon status={step.status} number={number} />
          <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
            <h2 className="text-base font-semibold">{step.title}</h2>
            <p className="text-sm text-muted">{step.help}</p>
            {step.status === 'skipped' && (
              <p className="text-sm text-subtle">{`Skipped — ${step.skipLabel}`}</p>
            )}
            {step.status === 'error' && (
              <p className="text-sm text-red-700">Could not check this step.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step.status === 'done' && <Badge tone="success">Done</Badge>}
            {step.status === 'todo' && (
              <>
                <Button asChild>
                  <Link to={`${step.path}?from=setup`}>
                    Set up<span className="sr-only">{` ${step.title}`}</span>
                  </Link>
                </Button>
                {step.skipLabel && (
                  <Button variant="secondary" onClick={onSkip}>
                    {step.skipLabel}
                  </Button>
                )}
              </>
            )}
            {step.status === 'skipped' && (
              <Button variant="secondary" onClick={onUndo}>
                Undo<span className="sr-only">{` skip for ${step.title}`}</span>
              </Button>
            )}
            {step.status === 'error' && (
              <Button variant="secondary" onClick={onRetry}>
                Retry<span className="sr-only">{` ${step.title}`}</span>
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </li>
  );
}

function StepIcon({ status, number }: { status: StepView['status']; number: number }) {
  const base = 'flex size-9 shrink-0 items-center justify-center rounded-full [&>svg]:size-5';
  if (status === 'done') {
    return (
      <span className={`${base} bg-green-100 text-green-800`}>
        <CheckCircle2 aria-hidden="true" />
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className={`${base} bg-surface-2 text-subtle`}>
        <MinusCircle aria-hidden="true" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className={`${base} bg-red-50 text-red-700`}>
        <AlertTriangle aria-hidden="true" />
      </span>
    );
  }
  if (status === 'loading') {
    return (
      <span className={`${base} bg-surface-2 text-subtle`}>
        <CircleDashed aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${base} bg-primary-50 font-semibold text-primary-800 tabular-nums`}
    >
      {number}
    </span>
  );
}
```

Check `Badge` accepts `tone="success"` and `CardBody` takes `className` (`shared/ui/Badge.tsx`, `shared/ui/Card.tsx`); use the kit's names if they differ.

- [ ] **Step 7: `index.ts`, nav and route**

`features/setup/index.ts`:

```ts
import { lazy } from 'react';

export const SetupPage = lazy(() =>
  import('./pages/SetupPage').then((m) => ({ default: m.SetupPage })),
);
export { SETUP_PERMISSIONS } from './steps';
export { useSetupProgress } from './useSetupProgress';
```

`app/navigation.ts`: import `ListChecks` from `lucide-react` and `SETUP_PERMISSIONS` from `@/features/setup`; add before the Admin entry:

```ts
  {
    to: '/setup',
    label: 'Setup guide',
    title: 'Setup guide',
    description: 'What is left before your first service.',
    icon: ListChecks,
    group: 'Setup',
    anyOf: SETUP_PERMISSIONS,
  },
```

`app/routes.tsx`: import `SetupPage, SETUP_PERMISSIONS` from `@/features/setup`; add after the `reports` route:

```tsx
      {
        path: 'setup',
        element: (
          <RequireAuth anyOf={SETUP_PERMISSIONS}>
            <SetupPage />
          </RequireAuth>
        ),
      },
```

(Indent to match the surrounding children of the pathless error route.)

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/features/setup src/app`
Expected: PASS. If a shell or routes test compares the full nav list exactly, add "Setup guide" there.

- [ ] **Step 9: Typecheck, lint, commit**

Run: `npx tsc --noEmit -p tsconfig.json` and from the repo root `pnpm lint` (no errors, no feature cycles).

```bash
git add apps/web/src
git commit -m "feat(web): setup guide page with self-ticking steps"
```

---

### Task 3: Home card and back link

**Files:**
- Create: `apps/web/src/features/setup/components/SetupCard.tsx`
- Modify: `apps/web/src/features/setup/index.ts` (export `SetupCard`)
- Modify: `apps/web/src/app/home/HomePage.tsx`
- Modify: `apps/web/src/app/admin/AdminLayout.tsx`
- Test: `apps/web/src/app/home/HomePage.test.tsx`, `apps/web/src/app/admin/SetupPages.test.tsx` (or a new `AdminLayout.test.tsx`)

**Interfaces:**
- Consumes: `useSetupProgress`, `SetupProgressBar` (Task 2).
- Produces: `SetupCard()`.

- [ ] **Step 1: Write the failing tests**

Add to `HomePage.test.tsx` (inside the existing `describe`):

```tsx
  it('asks a new owner to finish setup and links to the guide', async () => {
    localStorage.clear();
    useSession
      .getState()
      .setSession(sessionBody('OWNER', ['settings.manage', 'menu.manage'], 'Asha'));
    mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/outlet': () =>
        json({ name: 'Main Outlet', gstin: null, taxScheme: 'REGULAR', address: null, phone: null }),
      'GET /api/menu': () => json({ categories: [] }),
      'GET /api/floor': () => json([]),
      'GET /api/printers': () => json([]),
    });
    renderRoute('/');
    expect(await screen.findByText('Get your restaurant ready')).toBeInTheDocument();
    expect(screen.getByText('0 of 4 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue setup' })).toHaveAttribute('href', '/setup');
  });

  it('hides the setup card once setup is complete', async () => {
    localStorage.setItem('rpos.setup.skipped', JSON.stringify(['tables', 'printer']));
    useSession
      .getState()
      .setSession(sessionBody('OWNER', ['settings.manage', 'menu.manage'], 'Asha'));
    mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/outlet': () =>
        json({ name: 'Anna Mess', gstin: null, taxScheme: 'NONE', address: 'MG Road', phone: '9000000001' }),
      'GET /api/menu': () => json({ categories: [{ items: [{ id: 'i1' }] }] }),
      'GET /api/floor': () => json([]),
      'GET /api/printers': () => json([]),
    });
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Asha' })).toBeVisible();
    await screen.findByRole('link', { name: /POS|Admin|Menu/ });
    expect(screen.queryByText('Get your restaurant ready')).toBeNull();
    localStorage.clear();
  });
```

Add an AdminLayout test (new file `apps/web/src/app/admin/AdminLayout.test.tsx`):

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

describe('AdminLayout back link', () => {
  it('offers the way back to the setup guide only when opened from it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['devices.manage'], 'Asha'));
    mockApi({ 'GET /api/devices': () => json([]) });
    const first = renderRoute('/admin/devices?from=setup');
    expect(await screen.findByRole('link', { name: 'Back to setup guide' })).toHaveAttribute(
      'href',
      '/setup',
    );
    first.unmount();
    renderRoute('/admin/devices');
    await screen.findByRole('heading', { level: 1, name: 'Admin' });
    expect(screen.queryByRole('link', { name: 'Back to setup guide' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/home src/app/admin/AdminLayout.test.tsx`
Expected: FAIL — no "Get your restaurant ready", no "Back to setup guide".

- [ ] **Step 3: `SetupCard.tsx`**

```tsx
import { Rocket } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Card, CardBody } from '@/shared/ui';
import { useSetupProgress } from '../useSetupProgress';
import { SetupProgressBar } from './SetupProgressBar';

/** Home card for owners and managers until the setup guide is complete. */
export function SetupCard() {
  const setup = useSetupProgress();
  if (setup.total === 0 || setup.loading || setup.failed || setup.complete) return null;
  return (
    <Card className="border-primary-200 bg-primary-50">
      <CardBody className="flex flex-wrap items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-800">
          <Rocket aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
          <h2 className="font-semibold text-text">Get your restaurant ready</h2>
          <SetupProgressBar done={setup.done} total={setup.total} />
        </div>
        <Button asChild>
          <Link to="/setup">Continue setup</Link>
        </Button>
      </CardBody>
    </Card>
  );
}
```

Add `export { SetupCard } from './components/SetupCard';` to `features/setup/index.ts`.

- [ ] **Step 4: Home and AdminLayout**

`HomePage.tsx`: import `SetupCard` from `@/features/setup`; render `<SetupCard />` right after the `</header>` (before the day-not-open callout).

`AdminLayout.tsx`: import `ArrowLeft` from `lucide-react` and `useSearchParams` from `react-router`; in `AdminLayout` add `const [params] = useSearchParams();` and render between `PageHeader` and the `<nav>`:

```tsx
      {params.get('from') === 'setup' && (
        <Link
          to="/setup"
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary-800 underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to setup guide
        </Link>
      )}
```

(`Link` is already imported there from `react-router` together with `NavLink`; add it if not.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app src/features/setup`
Expected: PASS.

- [ ] **Step 6: Full checks and commit**

Run `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, and from the root `pnpm lint`. All green.

```bash
git add apps/web/src
git commit -m "feat(web): setup card on home and the way back from admin"
```

---

### Task 4: Real-app check

- [ ] **Step 1:** With api and web running, signed in as the dev owner: open `/setup`, check the counts against the dev data (the dev DB has one dish and a registered device or not), skip "Tables", follow **Set up** for Restaurant details, confirm "Back to setup guide" shows and returns, and confirm the home card text and that it disappears when complete. Check the page at 375 px wide.
- [ ] **Step 2:** If anything is changed, commit it with a message naming the fix.
