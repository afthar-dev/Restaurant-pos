import { Trash2 } from 'lucide-react';
import { expenseCategorySchema } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import {
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  RenameForm,
  secondaryButton,
  Sheet,
} from '@/shared/ui';
import { useAddCategory, useArchiveCategory, useRenameCategory } from '../mutations';
import { useExpenseCategories } from '../queries';

/** Add, rename or archive expense categories. Raw material belongs to purchases. */
export function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const categories = useExpenseCategories();
  const [name, setName] = useState('');
  const [invalid, setInvalid] = useState<string | undefined>();
  const [renaming, setRenaming] = useState<string | null>(null);
  const add = useAddCategory(() => setName(''));
  const rename = useRenameCategory(() => setRenaming(null));
  const archive = useArchiveCategory(() => undefined);
  const failure = [add, rename, archive].find((m) => m.isError)?.error;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = expenseCategorySchema.safeParse({ name: name.trim() });
    if (!parsed.success) return setInvalid(parsed.error.issues[0]?.message);
    setInvalid(undefined);
    add.mutate(parsed.data.name);
  }

  return (
    <Sheet label="Expense categories" onClose={onClose}>
      <h3 className="text-lg font-semibold">Expense categories</h3>
      <ul className="flex flex-col divide-y divide-border">
        {categories.data?.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 py-2">
            {renaming === c.id ? (
              <RenameForm
                id={`rename-${c.id}`}
                current={c.name}
                busy={rename.isPending}
                onSave={(newName) => rename.mutate({ id: c.id, name: newName })}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span>{c.name}</span>
                {c.isSystem ? (
                  <span className="text-xs text-subtle">Used by purchases</span>
                ) : (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className={secondaryButton}
                      aria-label={`Rename ${c.name}`}
                      onClick={() => setRenaming(c.id)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className={secondaryButton}
                      aria-label={`Remove ${c.name}`}
                      disabled={archive.isPending}
                      onClick={() => archive.mutate(c)}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove
                    </button>
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-2">
        <Field id="new-category" label="New category" error={invalid}>
          <input
            id="new-category"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <button type="submit" className={primaryButton} disabled={add.isPending}>
          Add
        </button>
      </form>
      <ErrorNote message={failure ? describeError(failure) : null} />
      <button type="button" className={secondaryButton} onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}
