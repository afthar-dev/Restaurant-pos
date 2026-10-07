import { useState } from 'react';
import { Field } from './Field';
import { inputClass, primaryButton, secondaryButton } from './styles';

/** Inline "rename" form used in setup lists. */
export function RenameForm({
  id,
  current,
  busy,
  error,
  onSave,
  onCancel,
}: {
  id: string;
  current: string;
  busy?: boolean;
  error?: string | null;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(current);
  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <Field id={id} label={`New name for ${current}`} error={error ?? undefined}>
        <input
          id={id}
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <button type="submit" className={primaryButton} disabled={busy}>
        Save name
      </button>
      <button type="button" className={secondaryButton} onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
