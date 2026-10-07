import { ArrowLeft, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useBootSession, useCurrentDevice } from '@/features/auth';
import { ServerStatus } from '@/features/health';
import { Toaster } from '@/features/notifications';
import { PrintWorker } from '@/features/printing';
import { RealtimeProvider } from '@/features/realtime';
import { useOutlet } from '@/features/settings';
import { cn } from '@/shared/lib/cn';
import { useSession } from '@/shared/session/store';
import { visibleNav } from './navigation';
import { BottomNav } from './shell/BottomNav';
import { DayStatusPill } from './shell/DayStatusPill';
import { Sidebar } from './shell/Sidebar';
import { UserMenu } from './shell/UserMenu';

const COLLAPSE_KEY = 'rpos.nav.collapsed';

function readCollapsed(): boolean | null {
  try {
    const value = localStorage.getItem(COLLAPSE_KEY);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
}

/** Signed-in screens: sidebar on desktop, top bar and bottom tabs on phones and tablets. */
function AppLayout() {
  const permissions = useSession((s) => s.permissions);
  const outlet = useOutlet();
  const { pathname } = useLocation();
  const entries = visibleNav(permissions);
  const [userCollapsed, setUserCollapsed] = useState(readCollapsed);
  // The POS needs both columns on a 1366 px counter screen: icons only unless the user chose.
  const collapsed = userCollapsed ?? pathname.startsWith('/pos');
  const wide = ['/pos', '/captain'].some((p) => pathname.startsWith(p));
  const outletName = outlet.data?.name ?? 'Restaurant POS';

  return (
    <div className="flex min-h-dvh bg-bg text-text">
      <Sidebar
        entries={entries}
        outletName={outletName}
        collapsed={collapsed}
        onToggle={() => {
          writeCollapsed(!collapsed);
          setUserCollapsed(!collapsed);
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur">
          <Link
            to="/"
            className="flex items-center gap-2 lg:hidden"
            aria-label={`${outletName}, home`}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-700 text-white">
              <UtensilsCrossed aria-hidden="true" className="size-4" />
            </span>
            <span className="max-w-40 truncate font-semibold">{outletName}</span>
          </Link>
          <div className="hidden lg:block">
            <DayStatusPill />
          </div>
          <div className="flex items-center gap-2">
            <ServerStatus />
            <UserMenu />
          </div>
          <div className="w-full pb-2 lg:hidden">
            <DayStatusPill />
          </div>
        </header>
        <main
          className={cn(
            'flex-1 pb-24 lg:pb-8',
            wide ? 'w-full px-3 pt-4' : 'mx-auto w-full max-w-6xl px-4 pt-6',
          )}
        >
          <Outlet />
        </main>
      </div>
      <BottomNav entries={entries} />
    </div>
  );
}

/** Sign-in, PIN pad and session restore: one centred column, nothing to navigate to yet. */
function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="flex min-h-16 items-center justify-between gap-2 px-4">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-700 text-white">
            <UtensilsCrossed aria-hidden="true" className="size-4" />
          </span>
          Restaurant POS
        </span>
        <ServerStatus />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * The kitchen display: dark, no chrome, readable from across the kitchen. A signed-in person
 * who opened it from the app gets a way back; the kitchen TV itself has no one signed in.
 */
function KitchenLayout() {
  const signedIn = useSession((s) => s.status === 'authenticated');
  return (
    <div data-theme="dark" className="min-h-dvh bg-bg text-text">
      {signedIn && (
        <Link
          to="/"
          className="fixed top-3 left-3 z-20 flex min-h-10 items-center gap-1 rounded-md bg-surface-2 px-3 text-sm font-medium text-text"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Link>
      )}
      <div className="fixed top-3 right-3 z-20">
        <ServerStatus />
      </div>
      <main className="px-3 pt-16 pb-3">
        <Outlet />
      </main>
    </div>
  );
}

export function AppShell() {
  useBootSession();
  const status = useSession((s) => s.status);
  const device = useCurrentDevice();
  const { pathname } = useLocation();
  const Layout = pathname.startsWith('/kds')
    ? KitchenLayout
    : status === 'authenticated'
      ? AppLayout
      : AuthLayout;

  return (
    <RealtimeProvider enabled={status === 'authenticated' || Boolean(device.data)}>
      <Layout />
      {/* Any registered screen may own a browser printer, so every one watches for jobs. */}
      {device.data && <PrintWorker />}
      <Toaster />
    </RealtimeProvider>
  );
}
