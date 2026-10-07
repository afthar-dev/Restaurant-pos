import type { Permission } from '@rpos/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useCurrentDevice } from '../hooks';
import { useSession } from '@/shared/session/store';

export function LoadingScreen() {
  return <p className="text-slate-600">Loading…</p>;
}

export function UnreachableScreen() {
  return <p className="text-slate-700">Cannot reach the server. Retrying…</p>;
}

/**
 * Renders children only for a signed-in user. `anyOf`: at least one of the permissions.
 * Signed-out users go to the PIN pad on a registered device, otherwise to manager sign-in.
 */
export function RequireAuth({ anyOf, children }: { anyOf?: Permission[]; children: ReactNode }) {
  const status = useSession((s) => s.status);
  const unreachable = useSession((s) => s.unreachable);
  const permissions = useSession((s) => s.permissions);
  const location = useLocation();
  const device = useCurrentDevice();

  if (status === 'loading') return unreachable ? <UnreachableScreen /> : <LoadingScreen />;
  if (status === 'anonymous') {
    if (device.data === undefined) {
      return device.isError ? <UnreachableScreen /> : <LoadingScreen />;
    }
    return (
      <Navigate to={device.data ? '/pin' : '/login'} replace state={{ from: location.pathname }} />
    );
  }
  if (anyOf && !anyOf.some((p) => permissions.includes(p))) {
    return <p className="text-slate-700">You do not have access to this screen.</p>;
  }
  return <>{children}</>;
}
