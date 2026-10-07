import { useMutation } from '@tanstack/react-query';
import { startSession } from './api';
import { useSession } from './store';

/** Starts a new session for the table and keeps it on this phone. */
export function useStartSession(code: string) {
  const open = useSession((s) => s.open);
  return useMutation({
    mutationFn: () => startSession(code),
    onSuccess: (session) => open(code, session),
  });
}
