import { dangerButton, secondaryButton } from './styles';

/** An inline "are you sure" bar; browsers' confirm() is avoided so the step is testable. */
export function ConfirmBar({
  question,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
      <p className="text-sm text-red-900">{question}</p>
      <button type="button" className={dangerButton} onClick={onConfirm} disabled={busy}>
        {confirmLabel}
      </button>
      <button type="button" className={secondaryButton} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
