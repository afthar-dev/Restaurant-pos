import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { apiFetch } from '@/shared/api/http';
import { useBootSession, useCurrentDevice } from '@/features/auth/hooks';
import { useSession } from '@/shared/session/store';
import { visibleAreas } from './Home';
import { PrintWorker } from '@/features/printing/PrintWorker';
import { RealtimeProvider } from '@/shared/realtime/RealtimeProvider';
import { Toaster } from '@/features/notifications';
import { ServerStatus } from '@/features/health/components/ServerStatus';

function SignOutButton() {
  const clear = useSession((s) => s.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', skipRefresh: true });
    } catch {
      // Even if the server is unreachable, forget the session on this screen.
    }
    clear();
    queryClient.clear();
    void navigate('/', { replace: true });
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="text-sm text-slate-600 underline"
    >
      Sign out
    </button>
  );
}

export function AppShell() {
  useBootSession();
  const user = useSession((s) => s.user);
  const permissions = useSession((s) => s.permissions);
  const status = useSession((s) => s.status);
  const device = useCurrentDevice();
  const { pathname } = useLocation();
  // Service screens use the whole width; admin and sign-in pages stay readable.
  const wide = ['/pos', '/captain', '/kds'].some((p) => pathname.startsWith(p));

  return (
    <RealtimeProvider enabled={status === 'authenticated' || Boolean(device.data)}>
      <div className="min-h-dvh bg-slate-50 text-slate-900">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium">
            <NavLink to="/" className="font-semibold text-emerald-800">
              Restaurant POS
            </NavLink>
            {visibleAreas(permissions).map((area) => (
              <NavLink
                key={area.to}
                to={area.to}
                className={({ isActive }) =>
                  isActive ? 'text-emerald-800 underline underline-offset-4' : 'text-slate-600'
                }
              >
                {area.short}
              </NavLink>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <ServerStatus />
            {user && (
              <>
                <span className="text-sm font-medium">{user.name}</span>
                <SignOutButton />
              </>
            )}
          </div>
        </header>
        <main className={wide ? 'w-full px-3 py-4' : 'mx-auto max-w-5xl px-4 py-8'}>
          <Outlet />
        </main>
        {/* Any registered screen may own a browser printer, so every one watches for jobs. */}
        {device.data && <PrintWorker />}
        <Toaster />
      </div>
    </RealtimeProvider>
  );
}
