import { useState } from 'react';
import { button, Sheet } from './ItemSheet';
import { rupees } from './money';
import type { CartLine } from './types';

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
      <h2 className="text-xl font-semibold">Your order</h2>
      <ul className="flex flex-col divide-y divide-slate-100">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-2 py-2">
            <span>
              {l.label}
              {l.note && <span className="block text-sm italic text-slate-500">“{l.note}”</span>}
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`One less ${l.label}`}
                className={`${button} w-11 border border-slate-300 px-0`}
                onClick={() => onQuantity(l.key, l.quantity - 1)}
              >
                −
              </button>
              <span className="w-6 text-center tabular-nums">{l.quantity}</span>
              <button
                type="button"
                aria-label={`One more ${l.label}`}
                className={`${button} w-11 border border-slate-300 px-0`}
                disabled={l.quantity >= 20}
                onClick={() => onQuantity(l.key, l.quantity + 1)}
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{rupees(total)}</span>
      </p>
      <p className="-mt-3 text-sm text-slate-500">
        Approximate, before tax. The bill has the final amount.
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Note for the kitchen (optional)</span>
        <input
          className="min-h-12 rounded-xl border border-slate-300 px-3"
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
        className={`${button} bg-emerald-700 text-white`}
        disabled={busy || lines.length === 0}
        onClick={() => onSend(note.trim())}
      >
        {busy ? 'Sending…' : 'Send to the staff'}
      </button>
      <button type="button" className={`${button} border border-slate-300`} onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}
