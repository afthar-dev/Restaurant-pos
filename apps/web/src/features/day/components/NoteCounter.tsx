import {
  CLOSE_NOTE_DENOMINATIONS,
  closeCountTotal,
  parseRupees,
  type CloseCount,
  type CloseNoteDenomination,
} from '@rpos/shared';
import { Minus, Plus } from 'lucide-react';
import { inputClass } from '@/shared/ui';
import { rupees } from '@/shared/lib/money';

/** What is typed on the counting screen: a number per note, and the coins in rupees. */
export interface CountDraft {
  notes: Record<CloseNoteDenomination, string>;
  coins: string;
}

export const emptyCount = (): CountDraft => ({
  notes: Object.fromEntries(CLOSE_NOTE_DENOMINATIONS.map((d) => [d, ''])) as CountDraft['notes'],
  coins: '',
});

const countOf = (text: string) => {
  const n = Number(text.trim() || '0');
  return Number.isInteger(n) && n >= 0 && n <= 100_000 ? n : null;
};

/** The count as sent to the server, or null while something typed is not a valid amount. */
export function toCount(draft: CountDraft): CloseCount | null {
  const coins = parseRupees(draft.coins.trim() || '0');
  if (coins === null) return null;
  const notes = {} as CloseCount['notes'];
  for (const d of CLOSE_NOTE_DENOMINATIONS) {
    const n = countOf(draft.notes[d]);
    if (n === null) return null;
    notes[d] = n;
  }
  return { notes, coins };
}

/** The running total in paise (an unreadable entry counts as nothing). */
export function draftTotal(draft: CountDraft): number {
  const count = toCount(draft);
  return count ? closeCountTotal(count) : 0;
}

/** A counter per note (− / typed number / +) and a box for coins, with the running total. */
export function NoteCounter({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: CountDraft;
  onChange: (next: CountDraft) => void;
}) {
  const setNote = (d: CloseNoteDenomination, text: string) =>
    onChange({ ...value, notes: { ...value.notes, [d]: text } });
  const step = (d: CloseNoteDenomination, by: number) =>
    setNote(d, String(Math.max(0, (countOf(value.notes[d]) ?? 0) + by)));

  return (
    <div className="flex flex-col gap-2">
      {CLOSE_NOTE_DENOMINATIONS.map((d) => {
        const n = countOf(value.notes[d]) ?? 0;
        return (
          <div key={d} className="flex items-center gap-2">
            <span className="w-14 text-sm font-medium tabular-nums">{`₹${d}`}</span>
            <button
              type="button"
              aria-label={`One less ₹${d} note`}
              className="grid size-11 place-items-center rounded-lg border border-border-strong bg-surface"
              onClick={() => step(d, -1)}
            >
              <Minus aria-hidden="true" className="size-4" />
            </button>
            <input
              id={`${idPrefix}-${d}`}
              aria-label={`₹${d} notes`}
              inputMode="numeric"
              className={`${inputClass} w-20 text-center tabular-nums`}
              value={value.notes[d]}
              placeholder="0"
              onChange={(e) => setNote(d, e.target.value)}
            />
            <button
              type="button"
              aria-label={`One more ₹${d} note`}
              className="grid size-11 place-items-center rounded-lg border border-border-strong bg-surface"
              onClick={() => step(d, 1)}
            >
              <Plus aria-hidden="true" className="size-4" />
            </button>
            <span className="ml-auto text-sm tabular-nums text-muted">
              {rupees(n * Number(d) * 100)}
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <label htmlFor={`${idPrefix}-coins`} className="w-14 text-sm font-medium">
          Coins
        </label>
        <input
          id={`${idPrefix}-coins`}
          aria-label="Coins (₹)"
          inputMode="decimal"
          className={`${inputClass} w-32 tabular-nums`}
          value={value.coins}
          placeholder="0"
          onChange={(e) => onChange({ ...value, coins: e.target.value })}
        />
      </div>
      <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
        <span>Counted total</span>
        <span className="tabular-nums">{rupees(draftTotal(value))}</span>
      </div>
    </div>
  );
}
