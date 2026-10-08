import type { Role } from '@rpos/shared';
import { ChevronDown, LogOut, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useCurrentDevice, useSignOut } from '@/features/auth';
import { useNotifications } from '@/features/notifications';
import { useSession } from '@/shared/session/store';
import { DropdownMenu, MenuItem, MenuLabel, MenuSeparator } from '@/shared/ui';

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Who is signed in, with "Switch staff" on shared devices and "Sign out". */
export function UserMenu() {
  const user = useSession((s) => s.user);
  const device = useCurrentDevice();
  const navigate = useNavigate();
  const signOut = useSignOut(() => {
    // Alerts belong to the person who signed out.
    useNotifications.getState().reset();
    void navigate('/', { replace: true });
  });
  if (!user) return null;
  return (
    <DropdownMenu
      label="Account"
      trigger={
        <button
          type="button"
          aria-label={`Account: ${user.name}`}
          className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-text hover:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800"
          >
            {initials(user.name)}
          </span>
          <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
          <ChevronDown aria-hidden="true" className="size-4 text-muted" />
        </button>
      }
    >
      <MenuLabel>
        <span className="block font-medium text-text">{user.name}</span>
        {ROLE_LABEL[user.role]}
      </MenuLabel>
      <MenuSeparator />
      {device.data && (
        // On a registered device, signing out lands on the PIN pad for the next person.
        <MenuItem icon={<Users />} onSelect={() => void signOut()}>
          Switch staff
        </MenuItem>
      )}
      <MenuItem icon={<LogOut />} tone="danger" onSelect={() => void signOut()}>
        Sign out
      </MenuItem>
    </DropdownMenu>
  );
}
