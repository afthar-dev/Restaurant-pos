import type { CashMovementKind } from '@rpos/shared';

export interface CashMovement {
  id: string;
  businessDayId: string;
  type: CashMovementKind;
  /** Paise, always positive. */
  amount: number;
  reasonCode: string;
  note: string | null;
  createdBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface NewCashMovement {
  type: CashMovementKind;
  amount: number;
  reasonCode: string;
  note?: string;
  overrideToken?: string;
}
