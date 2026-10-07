import type { Permission } from '@rpos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession, type SessionBody } from '@/shared/session/store';
import { login, logout, pinLogin, requestOverride } from './api';

function useSignInWith<Input>(
  request: (input: Input) => Promise<SessionBody>,
  onSignedIn: () => void,
) {
  const setSession = useSession((s) => s.setSession);
  return useMutation({
    mutationFn: request,
    onSuccess: (body) => {
      setSession(body);
      onSignedIn();
    },
  });
}

/** Owner or manager: mobile number and password. */
export const usePasswordSignIn = (onSignedIn: () => void) => useSignInWith(login, onSignedIn);

/** Staff on a registered device: name and PIN. */
export const usePinSignIn = (onSignedIn: () => void) => useSignInWith(pinLogin, onSignedIn);

/** Ends the session here even when the server cannot be reached, and drops cached data. */
export function useSignOut(onSignedOut: () => void) {
  const clear = useSession((s) => s.clear);
  const queryClient = useQueryClient();
  return async () => {
    try {
      await logout();
    } catch {
      // Even if the server is unreachable, forget the session on this screen.
    }
    clear();
    queryClient.clear();
    onSignedOut();
  };
}

/** A manager approves one action with their PIN; `onApproved` gets the single-use token. */
export function useRequestOverride(permission: Permission, onApproved: (token: string) => void) {
  return useMutation({
    mutationFn: ({ userId, pin }: { userId: string; pin: string }) =>
      requestOverride(userId, pin, permission),
    onSuccess: (token) => onApproved(token),
  });
}
