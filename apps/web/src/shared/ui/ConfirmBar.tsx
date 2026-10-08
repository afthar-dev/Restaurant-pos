import { TriangleAlert } from 'lucide-react';
import { buttonClass } from './styles';

/**
 * An inline "are you sure" bar under the row it is about. For destructive actions in a page
 * flow prefer ConfirmDialog; browsers' confirm() is avoided so the step is testable.
 */
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
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-red-700" />
      <p className="flex-1 text-sm text-red-900">{question}</p>
      <button
        type="button"
        className={buttonClass('danger', 'md')}
        onClick={onConfirm}
        disabled={busy}
      >
        {confirmLabel}
      </button>
      <button type="button" className={buttonClass('secondary', 'md')} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
