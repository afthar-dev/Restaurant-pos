import { useEffect } from 'react';
import { refreshSession } from '@/shared/api/http';
import { useSession } from '@/shared/session/store';

const BOOT_RETRY_MS = 5000;

/**
 * On first render, restore the session from the refresh cookie. If the server cannot be
 * reached, keep trying every few seconds instead of sending staff to the sign-in screen.
 */
export function useBootSession(): void {
  const status = useSession((s) => s.status);
  useEffect(() => {
    if (status !== 'loading') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const outcome = await refreshSession();
      if (!cancelled && outcome === 'unavailable')
        timer = setTimeout(() => void attempt(), BOOT_RETRY_MS);
    };
    void attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status]);
}
