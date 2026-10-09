import { Ellipsis, type LucideIcon } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { DropdownMenu, MenuItem } from '@/shared/ui';
import { isActive, type NavEntry } from '../navigation';

const tab = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium';

/** The icon of a tab; the current tab gets a saffron pill behind it. */
function TabIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      className={cn(
        'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
        active && 'bg-primary-100',
      )}
    >
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

/** Phone and tablet navigation: the first four areas as thumb-sized tabs, the rest under More. */
export function BottomNav({ entries }: { entries: NavEntry[] }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (entries.length <= 1) return null;
  const primary = entries.length > 5 ? entries.slice(0, 4) : entries;
  const more = entries.length > 5 ? entries.slice(4) : [];
  const moreActive = more.some((e) => isActive(e, pathname));
  return (
    <nav
      aria-label="Quick menu"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {primary.map((entry) => {
        const Icon = entry.icon;
        const active = isActive(entry, pathname);
        return (
          <NavLink
            key={entry.to}
            to={entry.to}
            aria-current={active ? 'page' : undefined}
            className={cn(tab, active ? 'font-semibold text-primary-800' : 'text-muted')}
          >
            <TabIcon icon={Icon} active={active} />
            {entry.label}
          </NavLink>
        );
      })}
      {more.length > 0 && (
        <DropdownMenu
          label="More"
          align="end"
          trigger={
            <button
              type="button"
              className={cn(tab, moreActive ? 'font-semibold text-primary-800' : 'text-muted')}
            >
              <TabIcon icon={Ellipsis} active={moreActive} />
              More
            </button>
          }
        >
          {more.map((entry) => {
            const Icon = entry.icon;
            return (
              <MenuItem key={entry.to} icon={<Icon />} onSelect={() => void navigate(entry.to)}>
                {entry.title}
              </MenuItem>
            );
          })}
        </DropdownMenu>
      )}
    </nav>
  );
}
