import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** Switch between views of one screen (arrow keys move between tabs). */
export function Tabs({
  value,
  onValueChange,
  label,
  tabs,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  tabs: { value: string; label: ReactNode }[];
  children: ReactNode;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className="flex flex-col gap-4">
      <RadixTabs.List
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              '-mb-px min-h-11 shrink-0 border-b-2 border-transparent px-4 text-sm font-medium text-muted',
              'hover:text-text data-[state=active]:border-primary-700 data-[state=active]:text-primary-800',
            )}
          >
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export const TabPanel = RadixTabs.Content;
