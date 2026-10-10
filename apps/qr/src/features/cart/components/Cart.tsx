import { useState } from 'react';
import { MessageSquare, Minus, Plus, Send, ShoppingBag } from 'lucide-react';
import { button, Sheet } from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
import type { CartLine } from '../types';

/** The dishes chosen so far, an order note, and Send. */
export function Cart({
  lines,
  busy,
  error,
  onQuantity,
  onSend,
  onClose,
}: {
  lines: CartLine[];
  busy: boolean;
  error: string | null;
  onQuantity: (key: string, quantity: number) => void;
  onSend: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  return (
    <Sheet label="Your order" onClose={onClose}>
      <h2 className="flex items-center gap-2 pr-12 text-xl font-bold">
        <ShoppingBag aria-hidden="true" className="size-5" />
        Your order
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-2xl bg-surface-2 px-3">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{l.label}</span>
              {l.note && <span className="block text-sm italic text-muted">“{l.note}”</span>}
              <span className="text-sm text-muted tabular-nums">{rupees(l.unitPrice)}</span>
            </span>
            <span className="flex h-10 items-center rounded-lg border border-primary-300 bg-surface text-primary-800">
              <button
                type="button"
                aria-label={`One less ${l.label}`}
                className="inline-flex h-full w-11 items-center justify-center"
                onClick={() => onQuantity(l.key, l.quantity - 1)}
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <span className="w-5 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
              <button
                type="button"
                aria-label={`One more ${l.label}`}
                className="inline-flex h-full w-11 items-center justify-center disabled:opacity-40"
                disabled={l.quantity >= 20}
                onClick={() => onQuantity(l.key, l.quantity + 1)}
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </span>
            <span className="w-16 text-right font-medium tabular-nums">
              {rupees(l.unitPrice * l.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 font-medium">
          <MessageSquare aria-hidden="true" className="size-4" />
          Cooking instructions (optional)
        </span>
        <input
          className="min-h-12 rounded-xl border border-border-strong bg-surface px-3"
          maxLength={140}
          placeholder="Allergies, less spicy…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <section
        aria-label="Bill summary"
        className="flex flex-col gap-1 rounded-2xl border border-border p-3"
      >
        <p className="flex justify-between text-base font-semibold">
          <span>Item total</span>
          <span className="tabular-nums">{rupees(total)}</span>
        </p>
        <p className="text-sm text-muted">GST is added on the final bill.</p>
      </section>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">
          {error}
        </p>
      )}
      <div className="sticky -bottom-4 -mx-4 -mb-4 border-t border-border bg-surface p-4">
        <button
          type="button"
          className={`${button} inline-flex w-full items-center justify-center gap-2 bg-primary-700 text-white`}
          disabled={busy || lines.length === 0}
          onClick={() => onSend(note.trim())}
        >
          <Send aria-hidden="true" className="size-4" />
          {busy ? 'Sending…' : 'Place order'}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          The staff confirm your order before it goes to the kitchen.
        </p>
      </div>
    </Sheet>
  );
}
