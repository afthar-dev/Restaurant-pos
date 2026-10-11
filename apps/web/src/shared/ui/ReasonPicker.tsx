import {
  CANCEL_REASONS,
  DISCOUNT_REASONS,
  VOID_REASONS,
  reasonLabel,
  type ReasonKind,
} from '@rpos/shared';
import { Field } from './Field';
import { inputClass } from './styles';
import { ReasonChips } from './ReasonChips';

type PickerKind = Extract<ReasonKind, 'discount' | 'void' | 'cancel'>;

const CODES: Record<PickerKind, readonly string[]> = {
  discount: DISCOUNT_REASONS,
  void: VOID_REASONS,
  cancel: CANCEL_REASONS,
};

/** What the person picked: a reason code, and a note that "Other" needs. */
export interface ReasonValue {
  code: string | null;
  note: string;
}

export const noReason: ReasonValue = { code: null, note: '' };

/** A code is chosen, and "Other" has a note of at least three characters. */
export function reasonReady(value: ReasonValue): boolean {
  return value.code !== null && (value.code !== 'OTHER' || value.note.trim().length >= 3);
}

/** The request fields for a ready reason; only "Other" carries a note. */
export function reasonRequest(value: ReasonValue): { reasonCode: string; note?: string } {
  const code = value.code ?? 'OTHER';
  return code === 'OTHER' ? { reasonCode: code, note: value.note.trim() } : { reasonCode: code };
}

/** One-tap reason chips; "Other" reveals a note field. */
export function ReasonPicker({
  kind,
  idPrefix,
  value,
  onChange,
}: {
  kind: PickerKind;
  idPrefix: string;
  value: ReasonValue;
  onChange: (next: ReasonValue) => void;
}) {
  const options = CODES[kind].map((code) => ({ code, label: reasonLabel(kind, code) }));
  return (
    <div className="flex flex-col gap-2">
      <ReasonChips
        label="Reason"
        options={options}
        value={value.code}
        onChange={(code) => onChange({ ...value, code })}
      />
      {value.code === 'OTHER' && (
        <Field id={`${idPrefix}-note`} label="What happened">
          <input
            id={`${idPrefix}-note`}
            className={inputClass}
            value={value.note}
            maxLength={200}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}
