import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { Tooltip } from '@/shared/ui';
import { isActive, type NavEntry, type NavGroup } from '../navigation';
import { BrandMark } from './BrandMark';

const GROUPS: NavGroup[] = ['Service', 'Back office', 'Setup'];

/** The desktop navigation: grouped areas, collapsible to icons to give the POS more room. */
export function Sidebar({
  entries,
  outletName,
  logoUrl,
  collapsed,
  onToggle,
}: {
  entries: NavEntry[];
  outletName: string;
  logoUrl: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { pathname } = useLocation();
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface lg:flex',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      <Link
        to="/"
        className="flex min-h-16 items-center gap-3 border-b border-border px-4"
        aria-label={`${outletName}, home`}
      >
        <BrandMark logoUrl={logoUrl} className="size-9" />
        {!collapsed && (
          <span className="truncate text-base font-semibold text-text">{outletName}</span>
        )}
      </Link>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {GROUPS.map((group) => {
          const items = entries.filter((e) => e.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-1">
              {!collapsed && <p className="px-3 pb-1 text-xs font-medium text-subtle">{group}</p>}
              {items.map((entry) => {
                const Icon = entry.icon;
                const link = (
                  <NavLink
                    key={entry.to}
                    to={entry.to}
                    aria-label={collapsed ? entry.label : undefined}
                    aria-current={isActive(entry, pathname) ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive(entry, pathname)
                        ? // A saffron rule on the left marks the current screen.
                          'bg-primary-50 font-semibold text-primary-800 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary-600'
                        : 'text-muted hover:bg-surface-2 hover:text-text',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    {!collapsed && entry.label}
                  </NavLink>
                );
                return collapsed ? (
                  <Tooltip key={entry.to} content={entry.label}>
                    {link}
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
        aria-expanded={!collapsed}
        className="flex min-h-12 items-center gap-3 border-t border-border px-6 text-sm text-muted hover:bg-surface-2 hover:text-text"
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden="true" className="size-5" />
        ) : (
          <>
            <PanelLeftClose aria-hidden="true" className="size-5" />
            Collapse
          </>
        )}
      </button>
    </aside>
  );
}
