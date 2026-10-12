import { KOT_REPRINT_REASONS, reasonLabel, type KotReprintReason } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import {
  Button,
  describeError,
  Dialog,
  ErrorNote,
  Field,
  inputClass,
  ReasonChips,
} from '@/shared/ui';
import { useReprintKot } from '../../mutations';
import type { OrderKot } from '../../types';

const OPTIONS = KOT_REPRINT_REASONS.map((code) => ({
  code,
  label: reasonLabel('kotReprint', code),
}));

/** Why the kitchen ticket is printed again: one tap on a reason, a note only for "Other". */
export function ReprintKotDialog({
  kot,
  orderId,
  onClose,
}: {
  kot: OrderKot;
  orderId: string;
  onClose: () => void;
}) {
  const reprint = useReprintKot(kot.id, orderId);
  const [reason, setReason] = useState<KotReprintReason | null>(null);
  const [note, setNote] = useState('');
  const name = `Reprint KOT ${kot.kotNo}`;
  const ready = reason !== null && (reason !== 'OTHER' || note.trim().length >= 3);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason || !ready) return;
    reprint.mutate(
      { reasonCode: reason, ...(reason === 'OTHER' ? { note: note.trim() } : {}) },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog label={name} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{name}</h2>
        <p className="text-sm text-muted">Why is the ticket printed again?</p>
        <ReasonChips label="Reason" options={OPTIONS} value={reason} onChange={setReason} />
        {reason === 'OTHER' && (
          <Field id={`reprint-note-${kot.id}`} label="What happened">
            <input
              id={`reprint-note-${kot.id}`}
              className={inputClass}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        )}
        <ErrorNote message={reprint.isError ? describeError(reprint.error) : null} />
        <div className="flex gap-2">
          <Button type="submit" disabled={!ready} loading={reprint.isPending}>
            Reprint
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
