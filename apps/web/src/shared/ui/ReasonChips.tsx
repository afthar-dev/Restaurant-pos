import { cn } from '@/shared/lib/cn';

/** One-tap reason choices (a radio group of chips); the caller decides when a note is needed. */
export function ReasonChips<C extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { code: C; label: string }[];
  value: C | null;
  onChange: (code: C) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const checked = option.code === value;
        return (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.code)}
            className={cn(
              'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors',
              checked
                ? 'border-primary-700 bg-primary-700 text-white'
                : 'border-border-strong bg-surface text-text hover:bg-surface-2',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
