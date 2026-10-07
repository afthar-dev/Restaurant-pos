import { create } from 'zustand';

/** `success` and `info` show at the bottom of the screen; `warning` at the top, in amber. */
export type ToastTone = 'success' | 'info' | 'warning';

export interface Toast {
  id: string;
  text: string;
  tone: ToastTone;
}

export interface NotifyInput {
  text: string;
  tone?: ToastTone;
  /** Same id replaces the toast already showing and restarts its timer. */
  id?: string;
  ttlMs?: number;
}

export const DEFAULT_TTL_MS = 10_000;

interface NotificationsState {
  toasts: Toast[];
  notify: (input: NotifyInput) => string;
  dismiss: (id: string) => void;
  reset: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let nextId = 0;

function stopTimer(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

/** Short-lived notices ("T4: food is ready to serve"). The store owns the timers. */
export const useNotifications = create<NotificationsState>()((set, get) => ({
  toasts: [],
  notify: ({ text, tone = 'info', id = `toast-${++nextId}`, ttlMs = DEFAULT_TTL_MS }) => {
    stopTimer(id);
    const toast: Toast = { id, text, tone };
    set((state) => {
      const index = state.toasts.findIndex((t) => t.id === id);
      if (index === -1) return { toasts: [...state.toasts, toast] };
      const toasts = [...state.toasts];
      toasts[index] = toast;
      return { toasts };
    });
    timers.set(
      id,
      setTimeout(() => get().dismiss(id), ttlMs),
    );
    return id;
  },
  dismiss: (id) => {
    stopTimer(id);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  reset: () => {
    for (const id of [...timers.keys()]) stopTimer(id);
    set({ toasts: [] });
  },
}));

/** Stable action for components; reading it does not re-render on new toasts. */
export const useNotify = () => useNotifications((s) => s.notify);
