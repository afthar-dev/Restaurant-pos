import { useEffect, useRef } from 'react';

export type SettleKey = 'c' | 'u' | 'k' | 'enter' | 'escape';

const KEYS: Record<string, SettleKey> = {
  c: 'c',
  u: 'u',
  k: 'k',
  enter: 'enter',
  escape: 'escape',
};

// The most recently mounted panel owns the keys.
const owners: symbol[] = [];

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, [role="button"]') !== null;
}

/**
 * Counter keyboard keys for settling a bill: C, U, K, Enter and Escape. Ignored while typing
 * in a field, with a modifier held or while a dialog or menu is open; Enter on a focused
 * button stays that button's.
 */
export function useSettleKeys(handler: (key: SettleKey) => boolean) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const id = Symbol('settle-keys');
    owners.push(id);
    const onKeyDown = (event: KeyboardEvent) => {
      if (owners[owners.length - 1] !== id) return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      const key = KEYS[event.key.toLowerCase()];
      if (!key) return;
      if (key === 'enter' && isControl(event.target)) return;
      if (latest.current(key)) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      owners.splice(owners.indexOf(id), 1);
    };
  }, []);
}
