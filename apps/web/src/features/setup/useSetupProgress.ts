import type { Permission } from '@rpos/shared';
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
  const can = (permission: Permission) => permissions.includes(permission);
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
