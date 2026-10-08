import type { Permission } from '@rpos/shared';
import { SETUP_PERMISSIONS } from '@/features/setup';
import {
  CalendarCheck,
  ChartColumn,
  ChefHat,
  LayoutDashboard,
  Package,
  PackageCheck,
  Settings,
  Smartphone,
  Store,
  Wallet,
  type LucideIcon,
  ListChecks,
} from 'lucide-react';

export const ADMIN_PERMISSIONS: Permission[] = [
  'users.manage',
  'settings.manage',
  'devices.manage',
  'menu.manage',
  'audit.view',
];

export type NavGroup = 'Service' | 'Back office' | 'Setup';

export interface NavEntry {
  to: string;
  /** Short name for the sidebar and tab bar. */
  label: string;
  /** Longer name and a sentence for the home page tiles. */
  title: string;
  description: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Shown when the user has any of these; empty means everyone signed in. */
  anyOf: Permission[];
}

/** Every area of the staff app, in the order people use them. */
export const NAV: NavEntry[] = [
  {
    to: '/',
    label: 'Home',
    title: 'Home',
    description: 'Today at a glance.',
    icon: LayoutDashboard,
    group: 'Service',
    anyOf: [],
  },
  {
    to: '/pos',
    label: 'POS',
    title: 'POS counter',
    description: 'Tables, parcels, bills and payments at the counter.',
    icon: Store,
    group: 'Service',
    anyOf: ['bill.print'],
  },
  {
    to: '/captain',
    label: 'Captain',
    title: 'Captain app',
    description: 'Waiters take table orders on their phones.',
    icon: Smartphone,
    group: 'Service',
    anyOf: ['order.take'],
  },
  {
    to: '/kds',
    label: 'Kitchen',
    title: 'Kitchen display',
    description: 'Live orders for the kitchen screen.',
    icon: ChefHat,
    group: 'Service',
    anyOf: [],
  },
  {
    to: '/availability',
    label: 'Availability',
    title: 'Item availability',
    description: 'Mark dishes out of stock so nobody can order them.',
    icon: PackageCheck,
    group: 'Service',
    anyOf: ['menu.availability'],
  },
  {
    to: '/day',
    label: 'Day close',
    title: 'Day close',
    description: 'Close the day, count the cash and see day reports.',
    icon: CalendarCheck,
    group: 'Back office',
    anyOf: ['day.openClose', 'reports.dayClose'],
  },
  {
    to: '/stock',
    label: 'Stock',
    title: 'Stock and purchases',
    description: 'Raw materials on hand, purchases from vendors and counts.',
    icon: Package,
    group: 'Back office',
    anyOf: ['stock.manage'],
  },
  {
    to: '/expenses',
    label: 'Expenses',
    title: 'Expenses',
    description: 'Money spent today: gas, salaries, repairs.',
    icon: Wallet,
    group: 'Back office',
    anyOf: ['expense.manage'],
  },
  {
    to: '/reports',
    label: 'Reports',
    title: 'Sales report',
    description: 'Sales, payments, dishes and expenses over any dates.',
    icon: ChartColumn,
    group: 'Back office',
    anyOf: ['reports.all'],
  },
  {
    to: '/setup',
    label: 'Setup guide',
    title: 'Setup guide',
    description: 'What is left before your first service.',
    icon: ListChecks,
    group: 'Setup',
    anyOf: SETUP_PERMISSIONS,
  },
  {
    to: '/admin',
    label: 'Admin',
    title: 'Admin',
    description: 'Menu, tables, staff, devices, tax and settings.',
    icon: Settings,
    group: 'Setup',
    anyOf: ADMIN_PERMISSIONS,
  },
];

/** The areas this user may open. Nothing before sign-in. */
export function visibleNav(permissions: Permission[]): NavEntry[] {
  if (permissions.length === 0) return [];
  return NAV.filter((n) => n.anyOf.length === 0 || n.anyOf.some((p) => permissions.includes(p)));
}

/** Where `pathname` belongs ("/admin/menu" is in Admin). */
export function isActive(entry: NavEntry, pathname: string): boolean {
  return entry.to === '/' ? pathname === '/' : pathname.startsWith(entry.to);
}
