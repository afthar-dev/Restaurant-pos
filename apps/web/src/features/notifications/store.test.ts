import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TTL_MS, useNotifications } from './store';

const texts = () => useNotifications.getState().toasts.map((t) => t.text);

describe('notifications store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useNotifications.getState().reset();
    vi.useRealTimers();
  });

  it('shows a toast and removes it after its time', () => {
    useNotifications.getState().notify({ text: 'T4: food is ready to serve', tone: 'success' });
    expect(texts()).toEqual(['T4: food is ready to serve']);
    vi.advanceTimersByTime(DEFAULT_TTL_MS - 1);
    expect(texts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('replaces a toast with the same id and restarts its timer', () => {
    const { notify } = useNotifications.getState();
    notify({ id: 'k1', text: 'first', ttlMs: 1000 });
    vi.advanceTimersByTime(900);
    notify({ id: 'k1', text: 'second', ttlMs: 1000 });
    expect(texts()).toEqual(['second']);
    vi.advanceTimersByTime(900);
    expect(texts()).toEqual(['second']);
    vi.advanceTimersByTime(100);
    expect(texts()).toEqual([]);
  });

  it('keeps toasts with different ids side by side and dismisses one on demand', () => {
    const { notify, dismiss } = useNotifications.getState();
    const a = notify({ text: 'A' });
    notify({ text: 'B' });
    dismiss(a);
    expect(texts()).toEqual(['B']);
  });
});
