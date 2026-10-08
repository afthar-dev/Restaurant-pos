import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** A dropdown menu opened by `trigger` (a button). Items are keyboard and screen-reader friendly. */
export function DropdownMenu({
  trigger,
  label,
  children,
  align = 'end',
}: {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          aria-label={label}
          align={align}
          sideOffset={6}
          className="z-50 min-w-52 animate-fade-in rounded-lg border border-border bg-surface p-1 shadow-overlay"
        >
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  tone,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  tone?: 'danger';
}) {
  return (
    <RadixMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none',
        'data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted',
        tone === 'danger' ? 'text-red-700' : 'text-text',
      )}
    >
      {icon}
      {children}
    </RadixMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className="px-3 py-2 text-xs text-muted">{children}</RadixMenu.Label>;
}

export const MenuSeparator = () => <RadixMenu.Separator className="my-1 h-px bg-border" />;

/** A short label on hover or focus, for icon-only controls on desktop. */
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side="right"
            sideOffset={8}
            className="z-50 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-overlay"
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
