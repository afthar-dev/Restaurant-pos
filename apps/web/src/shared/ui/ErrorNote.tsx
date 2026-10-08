import { CircleAlert, RotateCw } from 'lucide-react';
import { buttonClass } from './styles';

/** An error in plain words, announced to screen readers, with an optional "Try again". */
export function ErrorNote({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
