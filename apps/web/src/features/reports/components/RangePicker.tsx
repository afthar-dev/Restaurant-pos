import { useState } from 'react';
import { inputClass, secondaryButton } from '@/shared/ui';
import { PRESET_LABEL, presetRange, type DateRange, type Preset } from '../ranges';

const PRESETS = Object.keys(PRESET_LABEL) as Preset[];

/** Quick ranges (India dates) and a custom from–to. */
export function RangePicker({
  range,
  onChange,
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [custom, setCustom] = useState(false);
  const active = PRESETS.find((p) => {
    const r = presetRange(p);
    return !custom && r.from === range.from && r.to === range.to;
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={active === p}
            className={`${secondaryButton} min-h-11 ${active === p ? 'ring-2 ring-emerald-700' : ''}`}
            onClick={() => {
              setCustom(false);
              onChange(presetRange(p));
            }}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          className={`${secondaryButton} min-h-11 ${custom ? 'ring-2 ring-emerald-700' : ''}`}
          onClick={() => setCustom(true)}
        >
          Custom
        </button>
      </div>
      {custom && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="report-from">
            From
            <input
              id="report-from"
              type="date"
              className={inputClass}
              value={range.from}
              onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="report-to">
            To
            <input
              id="report-to"
              type="date"
              className={inputClass}
              value={range.to}
              onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
