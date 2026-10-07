import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal panel pinned to the bottom of the screen on phones and centred on larger screens,
 * so it is visible wherever the list was scrolled. Focus moves into it; Escape closes it.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:items-center">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl outline-none sm:max-w-lg sm:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}
