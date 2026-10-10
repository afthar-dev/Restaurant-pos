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
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <ShoppingBag aria-hidden="true" className="size-5" />
        Your order
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-2 py-2">
            <span>
              {l.label}
              {l.note && <span className="block text-sm italic text-muted">“{l.note}”</span>}
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`One less ${l.label}`}
                className={`${button} inline-flex w-11 items-center justify-center border border-border-strong px-0`}
                onClick={() => onQuantity(l.key, l.quantity - 1)}
              >
                <Minus aria-hidden="true" className="size-5" />
              </button>
              <span className="w-6 text-center tabular-nums">{l.quantity}</span>
              <button
                type="button"
                aria-label={`One more ${l.label}`}
                className={`${button} inline-flex w-11 items-center justify-center border border-border-strong px-0`}
                disabled={l.quantity >= 20}
                onClick={() => onQuantity(l.key, l.quantity + 1)}
              >
                <Plus aria-hidden="true" className="size-5" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{rupees(total)}</span>
      </p>
      <p className="-mt-3 text-sm text-muted">
        Approximate, before tax. The bill has the final amount.
      </p>
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 font-medium">
          <MessageSquare aria-hidden="true" className="size-4" />
          Note for the kitchen (optional)
        </span>
        <input
          className="min-h-12 rounded-xl border border-border-strong px-3"
          maxLength={140}
          placeholder="Allergies, less spicy…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`${button} inline-flex items-center justify-center gap-2 bg-primary-700 text-white`}
        disabled={busy || lines.length === 0}
        onClick={() => onSend(note.trim())}
      >
        <Send aria-hidden="true" className="size-4" />
        {busy ? 'Sending…' : 'Send to the staff'}
      </button>
    </Sheet>
  );
}
