import { useEffect } from 'react';

/**
 * Remembers what had focus when an overlay opened and puts focus back there when it closes
 * (unmounts). Dialogs here are rendered only while open, so Radix's own trigger-based focus
 * return does not apply.
 */
export function useReturnFocus(): void {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      // After the overlay's DOM is gone, so the opener is focusable again.
      setTimeout(() => {
        if (opener?.isConnected) opener.focus();
      }, 0);
    };
  }, []);
}
