import { CASH_REASON_KIND, reasonLabel } from '@rpos/shared';
import { time } from '@/shared/lib/when';
import type { DayReport } from './types';

type Movement = DayReport['cashMovements']['list'][number];

export const MOVEMENT_NAME = { PAY_IN: 'Cash in', PAY_OUT: 'Cash out', DROP: 'Cash drop' } as const;

/** "Float top-up", or "Other: Gas refill" when the reason was Other. */
export function movementReason(m: Movement): string {
  const label = reasonLabel(CASH_REASON_KIND[m.type], m.reasonCode);
  return m.reasonCode === 'OTHER' && m.note ? `${label}: ${m.note}` : label;
}

/** One line of the "Cash in / out" list: "9:00 am · Cash out · Meena · Supplier paid". */
export const movementLabel = (m: Movement): string =>
  `${time(m.at)} · ${MOVEMENT_NAME[m.type]} · ${m.by} · ${movementReason(m)}`;
